import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoomServiceClient } from 'livekit-server-sdk';
import { RoomCommentsService } from './room-comments.service';
import { RoomMembershipService } from './room-membership.service';
import { RoomModerationService } from './room-moderation.service';

const SWEEP_INTERVAL_MS = 5_000;

@Injectable()
export class RoomLifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoomLifecycleService.name);
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private sweepRunning = false;

  constructor(
    private readonly memberships: RoomMembershipService,
    private readonly comments: RoomCommentsService,
    private readonly moderation: RoomModerationService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.sweepTimer = setInterval(() => void this.reconcileFinishedRooms(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  /**
   * Called only for an intentional Leave after the client has disconnected.
   * Browser refresh/navigation teardown does not call this endpoint, so LiveKit's
   * departure timeout protects the room while the browser reconnects.
   */
  async handleExplicitLeave(identifier: string): Promise<boolean> {
    let roomId: string;
    try {
      roomId = await this.memberships.resolveRoomId(identifier);
    } catch (error) {
      if (error instanceof NotFoundException) return true;
      throw error;
    }

    const [room] = await this.roomServiceClient().listRooms([roomId]);
    if (room && Number(room.numParticipants ?? 0) > 0) return false;

    await this.deleteRoom(roomId);
    return true;
  }

  /** Force-delete a room and all of its ephemeral application state. */
  async deleteRoom(identifier: string): Promise<void> {
    let roomId: string;
    try {
      roomId = await this.memberships.resolveRoomId(identifier);
    } catch (error) {
      if (error instanceof NotFoundException) return;
      throw error;
    }

    const roomService = this.roomServiceClient();
    const [liveRoom] = await roomService.listRooms([roomId]);
    if (liveRoom) await roomService.deleteRoom(roomId);

    await this.clearEphemeralState(roomId);
  }

  async reconcileFinishedRooms(): Promise<void> {
    if (this.sweepRunning) return;
    this.sweepRunning = true;

    try {
      const applicationRooms = await this.memberships.listRooms();
      if (applicationRooms.length === 0) return;

      const liveRooms = await this.roomServiceClient().listRooms();
      const liveRoomIds = new Set(liveRooms.map((room) => room.name));

      for (const room of applicationRooms) {
        // A LiveKit room with zero participants is intentionally kept here:
        // emptyTimeout protects a newly created room and departureTimeout protects reloads.
        if (liveRoomIds.has(room.id)) continue;
        await this.clearEphemeralState(room.id);
        this.logger.log(`Removed finished ephemeral room ${room.id}.`);
      }
    } catch (error) {
      // Fail safe: a LiveKit outage must never cause application room state to be deleted.
      this.logger.warn(`Unable to reconcile finished rooms: ${this.errorMessage(error)}`);
    } finally {
      this.sweepRunning = false;
    }
  }

  private async clearEphemeralState(roomId: string): Promise<void> {
    try {
      await this.memberships.deleteRoom(roomId);
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
    } finally {
      this.comments.clearRoom(roomId);
      this.moderation.clearRoom(roomId);
    }
  }

  private roomServiceClient(): RoomServiceClient {
    const livekitUrl = this.config.getOrThrow<string>('LIVEKIT_URL').trim();
    const apiKey = this.config.getOrThrow<string>('LIVEKIT_API_KEY').trim();
    const apiSecret = this.config.getOrThrow<string>('LIVEKIT_API_SECRET').trim();
    const serviceUrl = livekitUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
    return new RoomServiceClient(serviceUrl, apiKey, apiSecret);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error && error.message ? error.message : String(error);
  }
}
