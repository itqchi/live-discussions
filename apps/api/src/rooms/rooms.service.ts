import { Injectable } from '@nestjs/common';
import type { JoinRoomRequest, JoinRoomResponse } from '@live-discussions/contracts';
import { AccessToken } from 'livekit-server-sdk';
import { permissionsForRole } from './room-permissions';

@Injectable()
export class RoomsService {
  async createJoinToken(request: JoinRoomRequest): Promise<JoinRoomResponse> {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL;

    if (!apiKey || !apiSecret || !livekitUrl) {
      throw new Error('LiveKit environment variables are not configured');
    }

    const permissions = permissionsForRole(request.role);
    const participant = {
      userId: request.userId,
      displayName: request.displayName,
      role: request.role,
      permissions,
    };

    const token = new AccessToken(apiKey, apiSecret, {
      identity: request.userId,
      name: request.displayName,
      metadata: JSON.stringify({ role: request.role }),
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
