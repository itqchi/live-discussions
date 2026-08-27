import {
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AuthenticatedUser,
  MuteParticipantRequest,
  ParticipantRole,
} from '@live-discussions/contracts';
import { RoomServiceClient, trackSourceToString } from 'livekit-server-sdk';
import { RoomMembershipService } from './room-membership.service';
import { liveKitPublishingPermission } from './room-permissions';

@Injectable()
export class RoomModerationService implements OnModuleDestroy {
  private readonly logger = new Logger(RoomModerationService.name);
  private readonly muteTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly mutedUntilByParticipant = new Map<string, number>();

  constructor(
    private readonly memberships: RoomMembershipService,
    private readonly config: ConfigService,
  ) {}

  onModuleDestroy(): void {
    for (const timer of this.muteTimers.values()) clearTimeout(timer);
    this.muteTimers.clear();
  }

  async getActiveMuteUntil(identifier: string, userId: string): Promise<number | null> {
    const roomId = await this.memberships.resolveRoomId(identifier);
    const mutedUntil = this.readMuteUntil(roomId, userId);
    if (!mutedUntil) return null;

    if (mutedUntil <= Date.now()) {
      this.setMuteUntil(roomId, userId, null);
      this.cancelMuteTimer(roomId, userId);
      return null;
    }

    this.scheduleMuteExpiry(roomId, userId, mutedUntil);
    return mutedUntil;
  }

  async muteParticipantMicrophone(
    request: MuteParticipantRequest,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const roomId = await this.memberships.resolveRoomId(request.roomId);
    const { target } = await this.resolveMuteTarget(roomId, request.participantId, actor);

    const roomService = this.roomServiceClient();
    const participant = await roomService.getParticipant(roomId, request.participantId);
    const microphone = participant.tracks.find(
      (track) => trackSourceToString(track.source) === 'microphone',
    );

    if (microphone && !microphone.muted) {
      await roomService.mutePublishedTrack(roomId, request.participantId, microphone.sid, true);
    }

    if (request.durationSeconds === null) return;

    const mutedUntil = Date.now() + request.durationSeconds * 1000;
    this.setMuteUntil(roomId, request.participantId, mutedUntil);

    try {
      await roomService.updateParticipant(roomId, request.participantId, {
        attributes: { mutedUntil: String(mutedUntil) },
        permission: liveKitPublishingPermission(target.role, target.onStage, false),
      });
    } catch (error) {
      this.setMuteUntil(roomId, request.participantId, null);
      this.cancelMuteTimer(roomId, request.participantId);
      throw error;
    }

    this.scheduleMuteExpiry(roomId, request.participantId, mutedUntil);
  }

  async releaseTimedMute(
    identifier: string,
    participantId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const roomId = await this.memberships.resolveRoomId(identifier);
    const { target } = await this.resolveMuteTarget(roomId, participantId, actor);
    const mutedUntil = this.readMuteUntil(roomId, participantId);
    if (!mutedUntil) return;

    this.setMuteUntil(roomId, participantId, null);
    this.cancelMuteTimer(roomId, participantId);

    const roomService = this.roomServiceClient();
    const activeRooms = await roomService.listRooms([roomId]);
    if (activeRooms.length === 0) return;

    const connected = await roomService.listParticipants(roomId);
    if (!connected.some((participant) => participant.identity === participantId)) return;

    try {
      await roomService.updateParticipant(roomId, participantId, {
        attributes: { mutedUntil: '' },
        permission: liveKitPublishingPermission(target.role, target.onStage, true),
      });
    } catch (error) {
      this.logger.warn(
        `Unable to release timed microphone mute for ${participantId} in ${roomId}; disconnecting participant: ${this.errorMessage(error)}`,
      );
      await roomService.removeParticipant(roomId, participantId);
    }
  }

  clearRoom(roomId: string): void {
    const prefix = `${roomId}:`;
    for (const key of [...this.mutedUntilByParticipant.keys()]) {
      if (key.startsWith(prefix)) this.mutedUntilByParticipant.delete(key);
    }
    for (const [key, timer] of [...this.muteTimers.entries()]) {
      if (!key.startsWith(prefix)) continue;
      clearTimeout(timer);
      this.muteTimers.delete(key);
    }
  }

  private async resolveMuteTarget(
    roomId: string,
    participantId: string,
    actor: AuthenticatedUser,
  ): Promise<{
    target: NonNullable<Awaited<ReturnType<RoomMembershipService['getMembership']>>>;
  }> {
    const actorRole = await this.memberships.getRole(roomId, actor.userId);
    if (actorRole !== 'owner' && actorRole !== 'moderator') {
      throw new ForbiddenException('Only owners and moderators can mute participants.');
    }

    if (participantId === actor.userId) {
      throw new ForbiddenException('Use your own microphone control to mute yourself.');
    }

    const target = await this.memberships.getMembership(roomId, participantId);
    if (!target) throw new ForbiddenException('Participant is not a room member.');
    this.assertMuteHierarchy(actorRole, target.role);
    return { target };
  }

  private assertMuteHierarchy(actorRole: ParticipantRole, targetRole: ParticipantRole): void {
    if (targetRole === 'owner') {
      throw new ForbiddenException('The room owner cannot be remotely muted.');
    }
    if (targetRole === 'moderator' && actorRole !== 'owner') {
      throw new ForbiddenException('Only the room owner can mute another moderator.');
    }
  }

  private scheduleMuteExpiry(roomId: string, userId: string, mutedUntil: number): void {
    const key = this.muteKey(roomId, userId);
    const current = this.muteTimers.get(key);
    if (current) clearTimeout(current);

    const delay = Math.max(0, mutedUntil - Date.now());
    this.muteTimers.set(
      key,
      setTimeout(() => {
        this.muteTimers.delete(key);
        void this.expireTimedMute(roomId, userId, mutedUntil);
      }, delay),
    );
  }

  private cancelMuteTimer(roomId: string, userId: string): void {
    const key = this.muteKey(roomId, userId);
    const timer = this.muteTimers.get(key);
    if (timer) clearTimeout(timer);
    this.muteTimers.delete(key);
  }

  private async expireTimedMute(
    roomId: string,
    userId: string,
    expectedMutedUntil: number,
  ): Promise<void> {
    try {
      const currentMutedUntil = this.readMuteUntil(roomId, userId);
      if (!currentMutedUntil) return;
      if (currentMutedUntil > expectedMutedUntil) {
        this.scheduleMuteExpiry(roomId, userId, currentMutedUntil);
        return;
      }
      if (currentMutedUntil > Date.now()) {
        this.scheduleMuteExpiry(roomId, userId, currentMutedUntil);
        return;
      }

      this.setMuteUntil(roomId, userId, null);
      const membership = await this.memberships.getMembership(roomId, userId);
      if (!membership) return;

      const roomService = this.roomServiceClient();
      const activeRooms = await roomService.listRooms([roomId]);
      if (activeRooms.length === 0) return;
      const connected = await roomService.listParticipants(roomId);
      if (!connected.some((participant) => participant.identity === userId)) return;

      try {
        await roomService.updateParticipant(roomId, userId, {
          attributes: { mutedUntil: '' },
          permission: liveKitPublishingPermission(membership.role, membership.onStage, true),
        });
      } catch (error) {
        this.logger.warn(
          `Unable to restore microphone permission for ${userId} in ${roomId}; disconnecting participant: ${this.errorMessage(error)}`,
        );
        await roomService.removeParticipant(roomId, userId);
      }
    } catch (error) {
      this.logger.error(
        `Unable to expire timed microphone mute for ${userId} in ${roomId}: ${this.errorMessage(error)}`,
      );
    }
  }

  private readMuteUntil(roomId: string, userId: string): number | null {
    return this.mutedUntilByParticipant.get(this.muteKey(roomId, userId)) ?? null;
  }

  private setMuteUntil(roomId: string, userId: string, mutedUntil: number | null): void {
    const key = this.muteKey(roomId, userId);
    if (mutedUntil === null) this.mutedUntilByParticipant.delete(key);
    else this.mutedUntilByParticipant.set(key, mutedUntil);
  }

  private muteKey(roomId: string, userId: string): string {
    return `${roomId}:${userId}`;
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

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
