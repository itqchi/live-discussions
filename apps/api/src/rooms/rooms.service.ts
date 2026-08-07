import { ServiceUnavailableException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser, JoinRoomRequest, JoinRoomResponse } from '@live-discussions/contracts';
import { AccessToken } from 'livekit-server-sdk';
import { permissionsForRole } from './room-permissions';
import { RoomMembershipService } from './room-membership.service';

@Injectable()
export class RoomsService {
  constructor(
    private readonly memberships: RoomMembershipService,
    private readonly config: ConfigService,
  ) {}

  async createJoinToken(request: JoinRoomRequest, user: AuthenticatedUser): Promise<JoinRoomResponse> {
    const apiKey = this.config.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.config.get<string>('LIVEKIT_API_SECRET');
    const livekitUrl = this.config.get<string>('LIVEKIT_URL');

    if (!apiKey || !apiSecret || !livekitUrl) {
      throw new ServiceUnavailableException(
        'LiveKit is not configured. Copy .env.example to .env and set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.',
      );
    }

    const role = await this.memberships.resolveRole(request.roomId, user);
    const permissions = permissionsForRole(role);
    const participant = {
      userId: user.userId,
      displayName: user.displayName,
      role,
      permissions,
    };

    const token = new AccessToken(apiKey, apiSecret, {
      identity: user.userId,
      name: user.displayName,
      metadata: JSON.stringify({ role }),
      ttl: '1h',
    });

    token.addGrant({
      roomJoin: true,
      room: request.roomId,
      canSubscribe: true,
      canPublish: permissions.canPublishAudio || permissions.canPublishVideo || permissions.canShareScreen,
    });

    return {
      livekitUrl,
      token: await token.toJwt(),
      participant,
    };
  }
}
