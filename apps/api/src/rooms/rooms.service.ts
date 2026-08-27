import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AuthenticatedUser,
  CloseRoomRequest,
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  ParticipantRole,
  RaiseHandRequest,
  RemoveParticipantRequest,
  RoomParticipant,
  RoomSummary,
  SetFeaturedParticipantRequest,
  SetStagePresenceRequest,
  UpdateParticipantRoleRequest,
} from '@live-discussions/contracts';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import {
  liveKitPublishingPermission,
  permissionsForRole,
} from './room-permissions';
import { RoomLifecycleService } from './room-lifecycle.service';
import {
  RoomMembershipService,
  type RoomMembershipState,
} from './room-membership.service';
import { RoomModerationService } from './room-moderation.service';
import { roomSlugFromTitle } from './room-slug';

interface LiveRoomMetadata {
  featuredParticipantId?: string;
}

const ROOM_EMPTY_BEFORE_FIRST_JOIN_SECONDS = 300;
const ROOM_DEPARTURE_GRACE_SECONDS = 20;

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(
    private readonly memberships: RoomMembershipService,
    private readonly moderation: RoomModerationService,
    private readonly lifecycle: RoomLifecycleService,
    private readonly config: ConfigService,
  ) {}

  async listRooms(): Promise<RoomSummary[]> {
    await this.lifecycle.reconcileFinishedRooms();
    return this.memberships.listRooms();
  }

  async createRoom(
    request: CreateRoomRequest,
    user: AuthenticatedUser,
    houseId: string | null = null,
  ): Promise<CreateRoomResponse> {
    const slug = roomSlugFromTitle(request.title);
    const summary = await this.memberships.createRoom(slug, request.title, user, houseId);
    const participant = this.toParticipant(user, 'owner', true, null);

    try {
      await this.roomServiceClient().createRoom({
        name: summary.id,
        emptyTimeout: ROOM_EMPTY_BEFORE_FIRST_JOIN_SECONDS,
        departureTimeout: ROOM_DEPARTURE_GRACE_SECONDS,
      });
    } catch (error) {
      await this.memberships.deleteRoom(summary.id);
      throw error;
    }

    return {
      room: {
        id: summary.id,
        slug: summary.slug,
        title: summary.title,
        description: summary.description,
        isLive: true,
        isLocked: summary.isLocked,
        participants: [participant],
      },
    };
  }

  async createJoinToken(request: JoinRoomRequest, user: AuthenticatedUser): Promise<JoinRoomResponse> {
    await this.lifecycle.reconcileFinishedRooms();
    const { livekitUrl, apiKey, apiSecret } = this.liveKitConfig();
    const summary = await this.memberships.getRoomSummary(request.roomId);
    const membership = await this.memberships.resolveMembership(summary.id, user);
    const mutedUntil = await this.moderation.getActiveMuteUntil(summary.id, user.userId);
    const participant = this.toParticipant(user, membership.role, membership.onStage, mutedUntil);
    const microphoneAllowed = mutedUntil === null;

    const token = new AccessToken(apiKey, apiSecret, {
      identity: user.userId,
      name: user.displayName,
      metadata: JSON.stringify({ role: membership.role }),
      attributes: {
        raisedHand: 'false',
        onStage: membership.onStage ? 'true' : 'false',
        mutedUntil: mutedUntil === null ? '' : String(mutedUntil),
      },
      ttl: '1h',
    });

    token.addGrant({
      roomJoin: true,
      room: summary.id,
      ...liveKitPublishingPermission(membership.role, membership.onStage, microphoneAllowed),
    });

    return {
      livekitUrl,
      token: await token.toJwt(),
      participant,
      roomId: summary.id,
      roomSlug: summary.slug,
      roomTitle: summary.title,
    };
  }

  async closeRoom(request: CloseRoomRequest, actor: AuthenticatedUser): Promise<void> {
    const roomId = await this.memberships.resolveRoomId(request.roomId);
    await this.assertCanModerate(roomId, actor.userId);
    await this.lifecycle.deleteRoom(roomId);
  }

  async setRaisedHand(request: RaiseHandRequest, user: AuthenticatedUser): Promise<void> {
    const roomId = await this.memberships.resolveRoomId(request.roomId);
    const role = await this.memberships.getRole(roomId, user.userId);
    if (!role) throw new ForbiddenException('You are not a member of this room.');

    await this.roomServiceClient().updateParticipant(roomId, user.userId, {
      attributes: { raisedHand: request.raised ? 'true' : 'false' },
    });
  }

  async setStagePresence(request: SetStagePresenceRequest, user: AuthenticatedUser): Promise<void> {
    const roomId = await this.memberships.resolveRoomId(request.roomId);
    const previous = await this.memberships.getMembership(roomId, user.userId);
    if (!previous) throw new ForbiddenException('You are not a member of this room.');
    if (previous.role === 'listener' && request.onStage) {
      throw new ForbiddenException('Listeners must be invited to speak before returning to the stage.');
    }

    const next: RoomMembershipState = { ...previous, onStage: request.onStage };
    const mutedUntil = await this.moderation.getActiveMuteUntil(roomId, user.userId);
    await this.memberships.setMembershipState(roomId, user.userId, next);

    try {
      await this.roomServiceClient().updateParticipant(
        roomId,
        user.userId,
        this.stagePresenceUpdate(next, mutedUntil),
      );
    } catch (error) {
      await this.restoreParticipantState(roomId, user.userId, previous);
      throw error;
    }
  }

  async setFeaturedParticipant(
    request: SetFeaturedParticipantRequest,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const roomId = await this.memberships.resolveRoomId(request.roomId);
    await this.assertCanModerate(roomId, actor.userId);
    const roomService = this.roomServiceClient();

    if (!request.participantId) {
      await roomService.updateRoomMetadata(roomId, JSON.stringify({} satisfies LiveRoomMetadata));
      return;
    }

    const targetRole = await this.memberships.getRole(roomId, request.participantId);
    if (!targetRole) throw new ForbiddenException('Participant is not a member of this room.');

    await roomService.getParticipant(roomId, request.participantId);
    await roomService.updateRoomMetadata(
      roomId,
      JSON.stringify({ featuredParticipantId: request.participantId } satisfies LiveRoomMetadata),
    );
  }

  async syncParticipantRoleIfConnected(
    roomIdentifier: string,
    userId: string,
    role: ParticipantRole,
  ): Promise<void> {
    const roomId = await this.memberships.resolveRoomId(roomIdentifier);
    const membership = await this.memberships.getMembership(roomId, userId);
    const state: RoomMembershipState = {
      role,
      onStage: role === 'listener' ? false : membership?.onStage ?? true,
    };
    const mutedUntil = await this.moderation.getActiveMuteUntil(roomId, userId);
    const roomService = this.roomServiceClient();

    const activeRooms = await roomService.listRooms([roomId]);
    if (activeRooms.length === 0) return;

    const connectedParticipants = await roomService.listParticipants(roomId);
    if (!connectedParticipants.some((connected) => connected.identity === userId)) return;

    try {
      await roomService.updateParticipant(roomId, userId, this.participantUpdate(state, mutedUntil));
      return;
    } catch (updateError) {
      let stillConnected: boolean;
      try {
        const participantsAfterFailure = await roomService.listParticipants(roomId);
        stillConnected = participantsAfterFailure.some((connected) => connected.identity === userId);
      } catch (verificationError) {
        this.logger.error(
          `Unable to verify participant ${userId} after role-sync failure in room ${roomId}: ${this.errorMessage(verificationError)}`,
        );
        throw new ServiceUnavailableException(
          'Unable to verify the connected participant after updating their House role.',
        );
      }

      if (!stillConnected) return;

      try {
        await roomService.removeParticipant(roomId, userId);
        this.logger.warn(
          `Disconnected ${userId} from room ${roomId} after live role sync failed: ${this.errorMessage(updateError)}`,
        );
      } catch (disconnectError) {
        this.logger.error(
          `Unable to enforce updated role for ${userId} in room ${roomId}: ${this.errorMessage(disconnectError)}`,
        );
        throw new ServiceUnavailableException(
          'Unable to enforce the updated House role for a connected participant.',
        );
      }
    }
  }

  async removeParticipant(
    request: RemoveParticipantRequest,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const roomId = await this.memberships.resolveRoomId(request.roomId);
    await this.assertCanModerate(roomId, actor.userId);

    if (request.participantId === actor.userId) {
      throw new ForbiddenException('Use Leave to exit the room yourself.');
    }

    const targetRole = await this.memberships.getRole(roomId, request.participantId);
    if (!targetRole) throw new ForbiddenException('Participant is not a member of this room.');
    if (targetRole === 'owner') throw new ForbiddenException('The room owner cannot be removed.');
    if (targetRole === 'moderator') {
      throw new ForbiddenException(
        'A House admin cannot be removed from an individual room. Change their House admin role instead.',
      );
    }

    const roomService = this.roomServiceClient();
    await roomService.removeParticipant(roomId, request.participantId);
    await this.clearFeaturedParticipantIfMatches(roomService, roomId, request.participantId);
  }

  async updateParticipantRole(
    request: UpdateParticipantRoleRequest,
    actor: AuthenticatedUser,
  ): Promise<RoomParticipant> {
    const roomId = await this.memberships.resolveRoomId(request.roomId);
    await this.assertCanModerate(roomId, actor.userId);
    const previous = await this.memberships.getMembership(roomId, request.participantId);

    if (!previous) throw new ForbiddenException('Participant is not a room member.');
    if (previous.role === 'owner') {
      throw new ForbiddenException('The room owner role cannot be changed here.');
    }
    if (previous.role === 'moderator') {
      throw new ForbiddenException(
        'A House admin role cannot be changed from the room. Use House Settings instead.',
      );
    }

    const next: RoomMembershipState = {
      role: request.role,
      onStage: request.role === 'speaker',
    };
    const mutedUntil = await this.moderation.getActiveMuteUntil(roomId, request.participantId);
    await this.memberships.setMembershipState(roomId, request.participantId, next);

    const roomService = this.roomServiceClient();
    try {
      const info = await roomService.updateParticipant(
        roomId,
        request.participantId,
        this.participantUpdate(next, mutedUntil),
      );

      return {
        userId: info.identity,
        displayName: info.name || info.identity,
        role: next.role,
        permissions: this.effectivePermissions(next.role, next.onStage, mutedUntil),
        raisedHand: false,
        onStage: next.onStage,
        mutedUntil,
      };
    } catch (error) {
      await this.restoreParticipantState(roomId, request.participantId, previous);
      throw error;
    }
  }

  private async restoreParticipantState(
    roomId: string,
    userId: string,
    state: RoomMembershipState,
  ): Promise<void> {
    await this.memberships.setMembershipState(roomId, userId, state);
    const mutedUntil = await this.moderation.getActiveMuteUntil(roomId, userId);
    const roomService = this.roomServiceClient();

    try {
      await roomService.updateParticipant(roomId, userId, this.participantUpdate(state, mutedUntil));
    } catch (rollbackError) {
      this.logger.warn(
        `Unable to restore live participant ${userId} in room ${roomId}: ${this.errorMessage(rollbackError)}`,
      );
      try {
        await roomService.removeParticipant(roomId, userId);
      } catch (removeError) {
        this.logger.error(
          `Unable to disconnect inconsistent participant ${userId} from room ${roomId}: ${this.errorMessage(removeError)}`,
        );
      }
    }
  }

  private participantUpdate(
    state: RoomMembershipState,
    mutedUntil: number | null,
  ): {
    metadata: string;
    attributes: Record<string, string>;
    permission: ReturnType<typeof liveKitPublishingPermission>;
  } {
    return {
      metadata: JSON.stringify({ role: state.role }),
      attributes: {
        raisedHand: 'false',
        onStage: state.onStage ? 'true' : 'false',
        mutedUntil: mutedUntil === null ? '' : String(mutedUntil),
      },
      permission: liveKitPublishingPermission(state.role, state.onStage, mutedUntil === null),
    };
  }

  private stagePresenceUpdate(
    state: RoomMembershipState,
    mutedUntil: number | null,
  ): {
    attributes: Record<string, string>;
    permission: ReturnType<typeof liveKitPublishingPermission>;
  } {
    return {
      attributes: {
        onStage: state.onStage ? 'true' : 'false',
        mutedUntil: mutedUntil === null ? '' : String(mutedUntil),
      },
      permission: liveKitPublishingPermission(state.role, state.onStage, mutedUntil === null),
    };
  }

  private effectivePermissions(
    role: ParticipantRole,
    onStage: boolean,
    mutedUntil: number | null,
  ): RoomParticipant['permissions'] {
    const base = permissionsForRole(role);
    if (!onStage) {
      return {
        ...base,
        canPublishAudio: false,
        canPublishVideo: false,
        canShareScreen: false,
      };
    }

    if (mutedUntil !== null) {
      return {
        ...base,
        canPublishAudio: false,
      };
    }

    return base;
  }

  private async assertCanModerate(roomId: string, userId: string): Promise<'owner' | 'moderator'> {
    const role = await this.memberships.getRole(roomId, userId);
    if (role !== 'owner' && role !== 'moderator') {
      throw new ForbiddenException('Only owners and moderators can perform this action.');
    }
    return role;
  }

  private async clearFeaturedParticipantIfMatches(
    roomService: RoomServiceClient,
    roomId: string,
    participantId: string,
  ): Promise<void> {
    const [room] = await roomService.listRooms([roomId]);
    const metadata = this.parseRoomMetadata(room?.metadata);

    if (metadata.featuredParticipantId === participantId) {
      await roomService.updateRoomMetadata(roomId, JSON.stringify({} satisfies LiveRoomMetadata));
    }
  }

  private parseRoomMetadata(metadata: string | undefined): LiveRoomMetadata {
    if (!metadata) return {};
    try {
      const parsed = JSON.parse(metadata) as LiveRoomMetadata;
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }

  private toParticipant(
    user: AuthenticatedUser,
    role: RoomParticipant['role'],
    onStage = role !== 'listener',
    mutedUntil: number | null = null,
  ): RoomParticipant {
    return {
      userId: user.userId,
      displayName: user.displayName,
      role,
      permissions: this.effectivePermissions(role, onStage, mutedUntil),
      raisedHand: false,
      onStage,
      mutedUntil,
    };
  }

  private roomServiceClient(): RoomServiceClient {
    const { livekitUrl, apiKey, apiSecret } = this.liveKitConfig();
    const serviceUrl = livekitUrl
      .replace(/^wss:/, 'https:')
      .replace(/^ws:/, 'http:');
    return new RoomServiceClient(serviceUrl, apiKey, apiSecret);
  }

  private liveKitConfig(): { livekitUrl: string; apiKey: string; apiSecret: string } {
    const apiKey = this.config.get<string>('LIVEKIT_API_KEY')?.trim();
    const apiSecret = this.config.get<string>('LIVEKIT_API_SECRET')?.trim();
    const livekitUrl = this.config.get<string>('LIVEKIT_URL')?.trim();
    const invalidFields = this.getInvalidLiveKitFields(livekitUrl, apiKey, apiSecret);

    if (invalidFields.length > 0) {
      throw new ServiceUnavailableException(
        `LiveKit configuration is invalid: ${invalidFields.join(', ')}. Update .env with credentials from your LiveKit project and restart the API.`,
      );
    }

    return { livekitUrl: livekitUrl!, apiKey: apiKey!, apiSecret: apiSecret! };
  }

  private getInvalidLiveKitFields(
    livekitUrl: string | undefined,
    apiKey: string | undefined,
    apiSecret: string | undefined,
  ): string[] {
    const invalidFields: string[] = [];
    if (!livekitUrl) invalidFields.push('LIVEKIT_URL (missing)');
    else if (livekitUrl.includes('your-project.livekit.cloud')) invalidFields.push('LIVEKIT_URL (placeholder)');
    if (!apiKey) invalidFields.push('LIVEKIT_API_KEY (missing)');
    else if (apiKey === 'replace-me') invalidFields.push('LIVEKIT_API_KEY (placeholder)');
    if (!apiSecret) invalidFields.push('LIVEKIT_API_SECRET (missing)');
    else if (apiSecret === 'replace-me') invalidFields.push('LIVEKIT_API_SECRET (placeholder)');
    return invalidFields;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error && error.message ? error.message : 'unknown LiveKit error';
  }
}
