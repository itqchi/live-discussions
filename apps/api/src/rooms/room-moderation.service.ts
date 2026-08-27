import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser, MuteParticipantRequest } from '@live-discussions/contracts';
import { RoomServiceClient, trackSourceToString } from 'livekit-server-sdk';
import { RoomMembershipService } from './room-membership.service';

@Injectable()
export class RoomModerationService {
  constructor(
    private readonly memberships: RoomMembershipService,
    private readonly config: ConfigService,
  ) {}

  async muteParticipantMicrophone(
    request: MuteParticipantRequest,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const roomId = await this.memberships.resolveRoomId(request.roomId);
    const actorRole = await this.memberships.getRole(roomId, actor.userId);
    if (actorRole !== 'owner' && actorRole !== 'moderator') {
      throw new ForbiddenException('Only owners and moderators can mute participants.');
    }

    if (request.participantId === actor.userId) {
      throw new ForbiddenException('Use your own microphone control to mute yourself.');
    }

    const targetRole = await this.memberships.getRole(roomId, request.participantId);
    if (!targetRole) throw new ForbiddenException('Participant is not a room member.');
    if (targetRole === 'owner') {
      throw new ForbiddenException('The room owner cannot be remotely muted.');
    }
    if (targetRole === 'moderator' && actorRole !== 'owner') {
      throw new ForbiddenException('Only the room owner can mute another moderator.');
    }

    const roomService = this.roomServiceClient();
    const participant = await roomService.getParticipant(roomId, request.participantId);
    const microphone = participant.tracks.find(
      (track) => trackSourceToString(track.source) === 'microphone',
    );

    if (!microphone || microphone.muted) return;
    await roomService.mutePublishedTrack(roomId, request.participantId, microphone.sid, true);
  }

  private roomServiceClient(): RoomServiceClient {
    const livekitUrl = this.config.getOrThrow<string>('LIVEKIT_URL').trim();
    const apiKey = this.config.getOrThrow<string>('LIVEKIT_API_KEY').trim();
    const apiSecret = this.config.getOrThrow<string>('LIVEKIT_API_SECRET').trim();
    const serviceUrl = livekitUrl
      .replace(/^wss:/, 'https:')
      .replace(/^ws:/, 'http:');

    return new RoomServiceClient(serviceUrl, apiKey, apiSecret);
  }
}
