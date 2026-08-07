import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser, JoinRoomRequest, JoinRoomResponse } from '@live-discussions/contracts';
import { AccessToken } from 'livekit-server-sdk';
import { permissionsForRole } from './room-permissions';
import { RoomMembershipService } from './room-membership.service';

@Injectable()
export class RoomsService {
  constructor(private readonly memberships: RoomMembershipService) {}

  async createJoinToken(request: JoinRoomRequest, user: AuthenticatedUser): Promise<JoinRoomResponse> {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL;

    if (!apiKey || !apiSecret || !livekitUrl) {
      throw new Error('LiveKit environment variables are not configured');
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
