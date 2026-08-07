import { Injectable, ServiceUnavailableException } from '@nestjs/common';
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
    const apiKey = this.config.get<string>('LIVEKIT_API_KEY')?.trim();
    const apiSecret = this.config.get<string>('LIVEKIT_API_SECRET')?.trim();
    const livekitUrl = this.config.get<string>('LIVEKIT_URL')?.trim();

    if (!this.hasValidLiveKitConfig(livekitUrl, apiKey, apiSecret)) {
      throw new ServiceUnavailableException(
        'LiveKit is not configured with real project credentials. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET in .env using values from your LiveKit project.',
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

  private hasValidLiveKitConfig(
    livekitUrl: string | undefined,
    apiKey: string | undefined,
    apiSecret: string | undefined,
  ): livekitUrl is string {
    if (!livekitUrl || !apiKey || !apiSecret) return false;

    return (
      !livekitUrl.includes('your-project.livekit.cloud') &&
      apiKey !== 'replace-me' &&
      apiSecret !== 'replace-me'
    );
  }
}
