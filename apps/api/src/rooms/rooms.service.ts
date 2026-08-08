import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AuthenticatedUser,
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  RaiseHandRequest,
  RoomParticipant,
  UpdateParticipantRoleRequest,
} from '@live-discussions/contracts';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { permissionsForRole } from './room-permissions';
import { RoomMembershipService } from './room-membership.service';

@Injectable()
export class RoomsService {
  constructor(
    private readonly memberships: RoomMembershipService,
    private readonly config: ConfigService,
  ) {}

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

  async updateParticipantRole(
    request: UpdateParticipantRoleRequest,
    actor: AuthenticatedUser,
  ): Promise<RoomParticipant> {
    const actorRole = await this.memberships.getRole(request.roomId, actor.userId);
    if (actorRole !== 'owner' && actorRole !== 'moderator') {
      throw new ForbiddenException('Only owners and moderators can change participant roles.');
    }

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

    const info = await this.roomServiceClient().updateParticipant(request.roomId, request.participantId, {
      metadata: JSON.stringify({ role: request.role }),
      attributes: { raisedHand: request.role === 'listener' ? undefined as never : 'false' },
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
