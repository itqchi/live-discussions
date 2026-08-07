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

    const invalidFields = this.getInvalidLiveKitFields(livekitUrl, apiKey, apiSecret);
    if (invalidFields.length > 0) {
      throw new ServiceUnavailableException(
        `LiveKit configuration is invalid for: ${invalidFields.join(', ')}. Update those values in .env with credentials from your LiveKit project and restart the API.`,
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

    const token = new AccessToken(apiKey!, apiSecret!, {
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
      livekitUrl: livekitUrl!,
      token: await token.toJwt(),
      participant,
    };
  }

  private getInvalidLiveKitFields(
    livekitUrl: string | undefined,
    apiKey: string | undefined,
    apiSecret: string | undefined,
  ): string[] {
    const invalidFields: string[] = [];

    if (!livekitUrl || livekitUrl.includes('your-project.livekit.cloud')) {
      invalidFields.push('LIVEKIT_URL');
    }

    if (!apiKey || apiKey === 'replace-me') {
      invalidFields.push('LIVEKIT_API_KEY');
    }

    if (!apiSecret || apiSecret === 'replace-me') {
      invalidFields.push('LIVEKIT_API_SECRET');
    }

    return invalidFields;
  }
}
