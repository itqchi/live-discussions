import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AuthenticatedUser,
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  RaiseHandRequest,
  RemoveParticipantRequest,
  RoomParticipant,
  RoomSummary,
  SetFeaturedParticipantRequest,
  UpdateParticipantRoleRequest,
} from '@live-discussions/contracts';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { permissionsForRole } from './room-permissions';
import { RoomMembershipService } from './room-membership.service';

interface LiveRoomMetadata {
  featuredParticipantId?: string;
}

@Injectable()
export class RoomsService {
  constructor(
    private readonly memberships: RoomMembershipService,
    private readonly config: ConfigService,
  ) {}

  listRooms(): Promise<RoomSummary[]> {
    return this.memberships.listRooms();
  }

  async createRoom(request: CreateRoomRequest, user: AuthenticatedUser): Promise<CreateRoomResponse> {
    await this.memberships.createRoom(request.roomId, request.title, user);
    const participant = this.toParticipant(user, 'owner');

    return {
      room: {
        id: request.roomId,
        title: request.title,
        isLive: false,
        participants: [participant],
      },
      participant,
    };
  }

  async createJoinToken(request: JoinRoomRequest, user: AuthenticatedUser): Promise<JoinRoomResponse> {
    const { livekitUrl, apiKey, apiSecret } = this.liveKitConfig();
    const role = await this.memberships.resolveRole(request.roomId, user);
    const participant = this.toParticipant(user, role);

    const token = new AccessToken(apiKey, apiSecret, {
      identity: user.userId,
      name: user.displayName,
      metadata: JSON.stringify({ role }),
      attributes: { raisedHand: 'false' },
      ttl: '1h',
    });

    token.addGrant({
      roomJoin: true,
      room: request.roomId,
      canSubscribe: true,
      canPublish: this.canPublish(participant),
      canPublishData: true,
    });

    return {
      livekitUrl,
      token: await token.toJwt(),
      participant,
    };
  }

  async setRaisedHand(request: RaiseHandRequest, user: AuthenticatedUser): Promise<void> {
    const role = await this.memberships.getRole(request.roomId, user.userId);
    if (!role) throw new ForbiddenException('You are not a member of this room.');

    await this.roomServiceClient().updateParticipant(request.roomId, user.userId, {
      attributes: { raisedHand: request.raised ? 'true' : 'false' },
    });
  }

  async setFeaturedParticipant(
    request: SetFeaturedParticipantRequest,
    actor: AuthenticatedUser,
  ): Promise<void> {
    await this.assertCanModerate(request.roomId, actor.userId);
    const roomService = this.roomServiceClient();

    if (!request.participantId) {
      await roomService.updateRoomMetadata(request.roomId, JSON.stringify({} satisfies LiveRoomMetadata));
      return;
    }

    const targetRole = await this.memberships.getRole(request.roomId, request.participantId);
    if (!targetRole) throw new ForbiddenException('Participant is not a member of this room.');

    await roomService.getParticipant(request.roomId, request.participantId);
    await roomService.updateRoomMetadata(
      request.roomId,
      JSON.stringify({ featuredParticipantId: request.participantId } satisfies LiveRoomMetadata),
    );
  }

  async removeParticipant(
    request: RemoveParticipantRequest,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const actorRole = await this.assertCanModerate(request.roomId, actor.userId);

    if (request.participantId === actor.userId) {
      throw new ForbiddenException('Use Leave to exit the room yourself.');
    }

    const targetRole = await this.memberships.getRole(request.roomId, request.participantId);
    if (!targetRole) throw new ForbiddenException('Participant is not a member of this room.');
    if (targetRole === 'owner') throw new ForbiddenException('The room owner cannot be removed.');
    if (actorRole === 'moderator' && targetRole === 'moderator') {
      throw new ForbiddenException('Moderators cannot remove other moderators.');
    }

    const roomService = this.roomServiceClient();
    await roomService.removeParticipant(request.roomId, request.participantId);
    await this.clearFeaturedParticipantIfMatches(roomService, request.roomId, request.participantId);
  }

  async updateParticipantRole(
    request: UpdateParticipantRoleRequest,
    actor: AuthenticatedUser,
  ): Promise<RoomParticipant> {
    const actorRole = await this.assertCanModerate(request.roomId, actor.userId);

    if (request.role === 'owner' && actorRole !== 'owner') {
      throw new ForbiddenException('Only the owner can assign the owner role.');
    }

    const targetRole = await this.memberships.getRole(request.roomId, request.participantId);
    if (!targetRole) throw new ForbiddenException('Participant is not a member of this room.');
    if (targetRole === 'owner' && actorRole !== 'owner') {
      throw new ForbiddenException('Moderators cannot change the owner role.');
    }

    await this.memberships.setRole(request.roomId, request.participantId, request.role);
    const permissions = permissionsForRole(request.role);
    const roomService = this.roomServiceClient();

    const info = await roomService.updateParticipant(request.roomId, request.participantId, {
      metadata: JSON.stringify({ role: request.role }),
      attributes: { raisedHand: 'false' },
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
    };
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

  private toParticipant(user: AuthenticatedUser, role: RoomParticipant['role']): RoomParticipant {
    return {
      userId: user.userId,
      displayName: user.displayName,
      role,
      permissions: permissionsForRole(role),
      raisedHand: false,
    };
  }

  private canPublish(participant: RoomParticipant): boolean {
    const permissions = participant.permissions;
    return permissions.canPublishAudio || permissions.canPublishVideo || permissions.canShareScreen;
  }

  private roomServiceClient(): RoomServiceClient {
    const { livekitUrl, apiKey, apiSecret } = this.liveKitConfig();
    return new RoomServiceClient(livekitUrl.replace(/^wss:/, 'https:'), apiKey, apiSecret);
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
}
