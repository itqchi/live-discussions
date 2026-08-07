import { Injectable, computed, inject, signal } from '@angular/core';
import type { JoinRoomRequest, JoinRoomResponse } from '@live-discussions/contracts';
import { RoomApiService } from './room-api.service';
import { RoomMediaService } from './room-media.service';

@Injectable()
export class RoomFacade {
  private readonly api = inject(RoomApiService);
  private readonly media = inject(RoomMediaService);

  readonly connected = this.media.connected.asReadonly();
  readonly microphoneEnabled = this.media.microphoneEnabled.asReadonly();
  readonly cameraEnabled = this.media.cameraEnabled.asReadonly();
  readonly videoTracks = this.media.videoTracks.asReadonly();

  readonly joining = signal(false);
  readonly error = signal<string | null>(null);
  readonly screenSharing = signal(false);
  readonly participant = signal<JoinRoomResponse['participant'] | null>(null);

  readonly canPublishAudio = computed(() => this.participant()?.permissions.canPublishAudio ?? false);
  readonly canPublishVideo = computed(() => this.participant()?.permissions.canPublishVideo ?? false);
  readonly canShareScreen = computed(() => this.participant()?.permissions.canShareScreen ?? false);
  readonly roleLabel = computed(() => this.participant()?.role ?? 'role pending');

  private readonly devUserId = this.getOrCreateDevUserId();

  async join(roomId: string, displayName: string): Promise<void> {
    const normalizedRoomId = roomId.trim();
    const normalizedDisplayName = displayName.trim();

    if (!normalizedRoomId || !normalizedDisplayName) {
      this.error.set('Room ID and display name are required.');
      return;
    }

    this.joining.set(true);
    this.error.set(null);

    const request: JoinRoomRequest = { roomId: normalizedRoomId };

    try {
      const session = await this.api.joinRoom(request, this.devUserId, normalizedDisplayName);
      await this.media.connect(session);
      this.participant.set(session.participant);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to join the room.');
    } finally {
      this.joining.set(false);
    }
  }

  toggleMicrophone(): Promise<void> {
    return this.media.setMicrophone(!this.microphoneEnabled());
  }

  toggleCamera(): Promise<void> {
    return this.media.setCamera(!this.cameraEnabled());
  }

  async toggleScreenShare(): Promise<void> {
    const next = !this.screenSharing();
    await this.media.setScreenShare(next);
    this.screenSharing.set(next);
  }

  leave(): void {
    this.media.disconnect();
    this.participant.set(null);
    this.screenSharing.set(false);
    this.error.set(null);
  }

  private getOrCreateDevUserId(): string {
    const key = 'live-discussions.dev-user-id';
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;

    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return id;
  }
}
