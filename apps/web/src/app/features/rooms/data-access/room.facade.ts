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
  readonly screenSharing = this.media.screenSharing.asReadonly();
  readonly audioPlaybackBlocked = this.media.audioPlaybackBlocked.asReadonly();
  readonly videoTracks = this.media.videoTracks.asReadonly();

  readonly joining = signal(false);
  readonly error = signal<string | null>(null);
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
      this.error.set(this.errorMessage(error, 'Unable to join the room.'));
    } finally {
      this.joining.set(false);
    }
  }

  async toggleMicrophone(): Promise<void> {
    await this.runMediaAction(
      () => this.media.setMicrophone(!this.microphoneEnabled()),
      'Unable to change microphone state.',
    );
  }

  async toggleCamera(): Promise<void> {
    await this.runMediaAction(
      () => this.media.setCamera(!this.cameraEnabled()),
      'Unable to change camera state.',
    );
  }

  async toggleScreenShare(): Promise<void> {
    await this.runMediaAction(
      () => this.media.setScreenShare(!this.screenSharing()),
      'Unable to change screen sharing state.',
    );
  }

  async resumeAudio(): Promise<void> {
    await this.runMediaAction(() => this.media.resumeAudio(), 'Unable to start room audio.');
  }

  leave(): void {
    this.media.disconnect();
    this.participant.set(null);
    this.error.set(null);
  }

  private async runMediaAction(action: () => Promise<void>, fallbackMessage: string): Promise<void> {
    this.error.set(null);

    try {
      await action();
    } catch (error) {
      this.error.set(this.errorMessage(error, fallbackMessage));
    }
  }

  private errorMessage(error: unknown, fallbackMessage: string): string {
    return error instanceof Error && error.message ? error.message : fallbackMessage;
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
