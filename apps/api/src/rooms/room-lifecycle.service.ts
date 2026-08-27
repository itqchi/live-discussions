import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoomServiceClient } from 'livekit-server-sdk';
import { RoomMembershipService } from './room-membership.service';

const DEFAULT_EMPTY_GRACE_SECONDS = 45;
const MIN_EMPTY_GRACE_SECONDS = 10;
const MAX_EMPTY_GRACE_SECONDS = 300;
const SWEEP_INTERVAL_MS = 10_000;

@Injectable()
export class RoomLifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoomLifecycleService.name);
  private readonly emptySince = new Map<string, number>();
  private readonly emptyGraceMs: number;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private sweepRunning = false;

  constructor(
    private readonly memberships: RoomMembershipService,
    private readonly config: ConfigService,
  ) {
    this.emptyGraceMs = this.resolveEmptyGraceMs();
  }

  onModuleInit(): void {
    this.sweepTimer = setInterval(() => void this.sweepEmptyRooms(), SWEEP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  /**
   * Called after a client intentionally disconnects. If it was the final
   * participant, remove the application room immediately. Browser refreshes do
   * not call this path, so they are protected by the empty-room grace window.
   */
  async handleExplicitLeave(identifier: string): Promise<boolean> {
    let roomId: string;
    try {
      roomId = await this.memberships.resolveRoomId(identifier);
    } catch (error) {
      if (error instanceof NotFoundException) return true;
      throw error;
    }

    const participantCount = await this.connectedParticipantCount(roomId);
    if (participantCount > 0) {
      this.emptySince.delete(roomId);
      return false;
    }

    return this.deleteRoomIfStillEmpty(roomId);
  }

  private async sweepEmptyRooms(): Promise<void> {
    if (this.sweepRunning) return;
    this.sweepRunning = true;

    try {
      const rooms = await this.memberships.listRooms();
      const roomIds = new Set(rooms.map((room) => room.id));
      for (const trackedRoomId of this.emptySince.keys()) {
        if (!roomIds.has(trackedRoomId)) this.emptySince.delete(trackedRoomId);
      }
      if (rooms.length === 0) return;

      const liveRooms = await this.roomServiceClient().listRooms();
      const connectedByRoomId = new Map(
        liveRooms.map((room) => [room.name, Number(room.numParticipants ?? 0)]),
      );
      const now = Date.now();

      for (const room of rooms) {
        const participantCount = connectedByRoomId.get(room.id) ?? 0;
        if (participantCount > 0) {
          this.emptySince.delete(room.id);
          continue;
        }

        const since = this.emptySince.get(room.id);
        if (since === undefined) {
          this.emptySince.set(room.id, now);
          continue;
        }

        if (now - since >= this.emptyGraceMs) {
          await this.deleteRoomIfStillEmpty(room.id);
        }
      }
    } catch (error) {
      // Fail safe: a LiveKit/API outage must never cause application rooms to be deleted.
      this.logger.warn(`Unable to reconcile empty rooms: ${this.errorMessage(error)}`);
    } finally {
      this.sweepRunning = false;
    }
  }

  private async deleteRoomIfStillEmpty(roomId: string): Promise<boolean> {
    const roomService = this.roomServiceClient();
    const [liveRoom] = await roomService.listRooms([roomId]);
    if (liveRoom && Number(liveRoom.numParticipants ?? 0) > 0) {
      this.emptySince.delete(roomId);
      return false;
    }

    if (liveRoom) await roomService.deleteRoom(roomId);

    try {
      await this.memberships.deleteRoom(roomId);
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
    }

    this.emptySince.delete(roomId);
    this.logger.log(`Deleted empty room ${roomId}.`);
    return true;
  }

  private async connectedParticipantCount(roomId: string): Promise<number> {
    const [room] = await this.roomServiceClient().listRooms([roomId]);
    return Number(room?.numParticipants ?? 0);
  }

  private roomServiceClient(): RoomServiceClient {
    const livekitUrl = this.config.getOrThrow<string>('LIVEKIT_URL').trim();
    const apiKey = this.config.getOrThrow<string>('LIVEKIT_API_KEY').trim();
    const apiSecret = this.config.getOrThrow<string>('LIVEKIT_API_SECRET').trim();
    const serviceUrl = livekitUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
    return new RoomServiceClient(serviceUrl, apiKey, apiSecret);
  }

  private resolveEmptyGraceMs(): number {
    const configured = Number(this.config.get<string>('ROOM_EMPTY_GRACE_SECONDS'));
    const seconds = Number.isInteger(configured)
      ? Math.min(MAX_EMPTY_GRACE_SECONDS, Math.max(MIN_EMPTY_GRACE_SECONDS, configured))
      : DEFAULT_EMPTY_GRACE_SECONDS;
    return seconds * 1000;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error && error.message ? error.message : String(error);
  }
}
