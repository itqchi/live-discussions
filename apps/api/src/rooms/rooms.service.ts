import { ForbiddenException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
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
import { permissionsForRole } from './room-permissions';
import { RoomMembershipService } from './room-membership.service';
import { roomSlugFromTitle } from './room-slug';

interface LiveRoomMetadata {
  featuredParticipantId?: string;
}

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(
    private readonly memberships: RoomMembershipService,
    private readonly config: ConfigService,
  ) {}

  listRooms(): Promise<RoomSummary[]> {
    return this.memberships.listRooms();
  }

  async createRoom(request: CreateRoomRequest, user: AuthenticatedUser): Promise<CreateRoomResponse> {
    const slug = roomSlugFromTitle(request.title);
    const summary = await this.memberships.createRoom(slug, request.title, user);
    const participant = this.toParticipant(user, 'owner', true);

    return {
      room: {
        id: summary.id,
        slug: summary.slug,
        title: summary.title,
        isLive: true,
        participants: [participant],
      },
      participant,
    };
  }

  async createJoinToken(request: JoinRoomRequest, user: AuthenticatedUser): Promise<JoinRoomResponse> {
    const { livekitUrl, apiKey, apiSecret } = this.liveKitConfig();
    const summary = await this.memberships.getRoomSummary(request.roomId);
    const membership = await this.memberships.resolveMembership(summary.id, user);
    const participant = this.toParticipant(user, membership.role, membership.onStage);

    const token = new AccessToken(apiKey, apiSecret, {
      identity: user.userId,
      name: user.displayName,
      metadata: JSON.stringify({ role: membership.role }),
      attributes: {
        raisedHand: 'false',
        onStage: membership.onStage ? 'true' : 'false',
      },
      ttl: '1h',
    });

    token.addGrant({
      roomJoin: true,
      room: summary.id,
      canSubscribe: true,
      canPublish: this.canPublish(participant),
      canPublishData: true,
    });

    return {
      livekitUrl,
      token: await token.toJwt(),
      participant,
      roomId: summary.id,
      roomSlug: summary.slug,
    };
  }

  async closeRoom(request: CloseRoomRequest, actor: AuthenticatedUser): Promise<void> {
    const roomId = await this.memberships.resolveRoomId(request.roomId);
    await this.assertCanModerate(roomId, actor.userId);
    await this.deleteLiveKitRoomIfPresent(roomId);
    await this.memberships.deleteRoom(roomId);
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
    const membership = await this.memberships.getMembership(roomId, user.userId);
    if (!membership) throw new ForbiddenException('You are not a member of this room.');
    if (membership.role === 'listener' && request.onStage) {
      throw new ForbiddenException('Listeners must be invited to speak before returning to the stage.');
    }

    await this.memberships.setStagePresence(roomId, user.userId, request.onStage);
    await this.roomServiceClient().updateParticipant(roomId, user.userId, {
      attributes: { onStage: request.onStage ? 'true' : 'false' },
    });
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
    const permissions = permissionsForRole(role);
    const roomId = await this.memberships.resolveRoomId(roomIdentifier);
    const membership = await this.memberships.getMembership(roomId, userId);
    const onStage = membership?.onStage ?? role !== 'listener';

    try {
      await this.roomServiceClient().updateParticipant(roomId, userId, {
        metadata: JSON.stringify({ role }),
        attributes: {
          raisedHand: 'false',
          onStage: onStage ? 'true' : 'false',
        },
        permission: {
          canSubscribe: true,
          canPublish: permissions.canPublishAudio || permissions.canPublishVideo || permissions.canShareScreen,
          canPublishData: true,
        },
      });
    } catch (error) {
      // Persistence is authoritative. Offline participants receive the persisted role/state on their next join.
      this.logger.debug(
        `Skipped live role sync for ${userId} in room ${roomId}: ${this.errorMessage(error)}`,
      );
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
    const targetMembership = await this.memberships.getMembership(roomId, request.participantId);

    if (!targetMembership) throw new ForbiddenException('Participant is not a room member.');
    if (targetMembership.role === 'owner') {
      throw new ForbiddenException('The room owner role cannot be changed here.');
    }
    if (targetMembership.role === 'moderator') {
      throw new ForbiddenException(
        'A House admin role cannot be changed from the room. Use House Settings instead.',
      );
    }

    await this.memberships.setRole(roomId, request.participantId, request.role);
    const permissions = permissionsForRole(request.role);
    const roomService = this.roomServiceClient();
    const membership = await this.memberships.getMembership(roomId, request.participantId);
    const onStage = membership?.onStage ?? request.role === 'speaker';

    const info = await roomService.updateParticipant(roomId, request.participantId, {
      metadata: JSON.stringify({ role: request.role }),
      attributes: {
        raisedHand: 'false',
        onStage: onStage ? 'true' : 'false',
      },
      permission: {
        canSubscribe: true,
        canPublish: permissions.canPublishAudio || permissions.canPublishVideo || permissions.canShareScreen,
        canPublishData: true,
      },
    });

    return {
      userId: info.identity,
      displayName: info.name || info.identity,
      role: request.role,
      permissions,
      raisedHand: false,
      onStage,
    };
  }

  private async assertCanModerate(roomId: string, userId: string): Promise<'owner' | 'moderator'> {
    const role = await this.memberships.getRole(roomId, userId);
    if (role !== 'owner' && role !== 'moderator') {
      throw new ForbiddenException('Only owners and moderators can perform this action.');
    }
    return role;
  }

  private async deleteLiveKitRoomIfPresent(roomId: string): Promise<void> {
    const roomService = this.roomServiceClient();
    try {
      await roomService.deleteRoom(roomId);
    } catch (error) {
      const rooms = await roomService.listRooms([roomId]);
      if (rooms.length > 0) throw error;
    }
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
  ): RoomParticipant {
    return {
      userId: user.userId,
      displayName: user.displayName,
      role,
      permissions: permissionsForRole(role),
      raisedHand: false,
      onStage,
    };
  }

  private canPublish(participant: RoomParticipant): boolean {
    const permissions = participant.permissions;
    return permissions.canPublishAudio || permissions.canPublishVideo || permissions.canShareScreen;
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
