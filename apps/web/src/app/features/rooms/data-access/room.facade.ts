import { Injectable, computed, inject, signal } from '@angular/core';
import type { JoinRoomRequest, JoinRoomResponse, ParticipantRole } from '@live-discussions/contracts';
import { Track } from 'livekit-client';
import { DevIdentityService } from '../../../core/dev-identity.service';
import { RoomApiService } from './room-api.service';
import { RoomMediaService } from './room-media.service';

@Injectable()
export class RoomFacade {
  private readonly api = inject(RoomApiService);
  private readonly media = inject(RoomMediaService);
  private readonly identity = inject(DevIdentityService);

  readonly connected = this.media.connected.asReadonly();
  readonly microphoneEnabled = this.media.microphoneEnabled.asReadonly();
  readonly cameraEnabled = this.media.cameraEnabled.asReadonly();
  readonly screenSharing = this.media.screenSharing.asReadonly();
  readonly audioPlaybackBlocked = this.media.audioPlaybackBlocked.asReadonly();
  readonly participants = this.media.participants.asReadonly();
  readonly comments = this.media.comments.asReadonly();
  readonly videoTracks = this.media.videoTracks.asReadonly();
  readonly featuredParticipantId = this.media.featuredParticipantId.asReadonly();
  readonly displayName = this.identity.displayName;

  readonly joining = signal(false);
  readonly creating = signal(false);
  readonly sendingComment = signal(false);
  readonly error = signal<string | null>(null);
  readonly participant = signal<JoinRoomResponse['participant'] | null>(null);

  private readonly roomId = signal<string | null>(null);
  private readonly joinedDisplayName = signal<string | null>(null);

  readonly localPresence = computed(() => this.participants().find((participant) => participant.isLocal) ?? null);
  readonly currentRole = computed<ParticipantRole>(() => this.localPresence()?.role ?? this.participant()?.role ?? 'listener');
  readonly canPublishAudio = computed(() => this.currentRole() !== 'listener');
  readonly canPublishVideo = computed(() => this.currentRole() !== 'listener');
  readonly canShareScreen = computed(() => this.currentRole() !== 'listener');
  readonly canModerate = computed(() => this.currentRole() === 'owner' || this.currentRole() === 'moderator');
  readonly raisedHand = computed(() => this.localPresence()?.raisedHand ?? false);
  readonly roleLabel = computed(() => this.currentRole());

  readonly stageParticipants = computed(() =>
    this.participants().filter((participant) => participant.role !== 'listener'),
  );

  readonly audienceParticipants = computed(() =>
    this.participants().filter((participant) => participant.role === 'listener'),
  );

  readonly mainStageTrack = computed(() => {
    const tracks = this.videoTracks();
    const featuredParticipantId = this.featuredParticipantId();

    if (featuredParticipantId) {
      const featuredCamera = tracks.find(
        (tile) => tile.participantIdentity === featuredParticipantId && tile.source === Track.Source.Camera,
      );
      if (featuredCamera) return featuredCamera;
    }

    const screenShare = tracks.find((tile) => tile.source === Track.Source.ScreenShare);
    if (screenShare) return screenShare;

    return tracks.find((tile) => tile.source === Track.Source.Camera) ?? null;
  });

  readonly mediaThumbnails = computed(() => {
    const mainTrack = this.mainStageTrack();
    return this.videoTracks().filter((tile) => tile.id !== mainTrack?.id);
  });

  async createAndJoin(roomId: string, displayName: string): Promise<void> {
    const normalizedRoomId = roomId.trim();
    const normalizedDisplayName = displayName.trim();
    if (!this.validateIdentity(normalizedRoomId, normalizedDisplayName)) return;

    this.creating.set(true);
    this.error.set(null);

    try {
      this.identity.setDisplayName(normalizedDisplayName);
      await this.api.createRoom(
        { roomId: normalizedRoomId, title: normalizedRoomId },
        this.identity.userId,
        normalizedDisplayName,
      );
      await this.join(normalizedRoomId, normalizedDisplayName);
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to create the room.'));
    } finally {
      this.creating.set(false);
    }
  }

  async join(roomId: string, displayName: string): Promise<void> {
    const normalizedRoomId = roomId.trim();
    const normalizedDisplayName = displayName.trim();
    if (!this.validateIdentity(normalizedRoomId, normalizedDisplayName)) return;

    this.joining.set(true);
    this.error.set(null);

    const request: JoinRoomRequest = { roomId: normalizedRoomId };

    try {
      const session = await this.api.joinRoom(request, this.identity.userId, normalizedDisplayName);
      await this.media.connect(session);
      this.participant.set(session.participant);
      this.roomId.set(normalizedRoomId);
      this.joinedDisplayName.set(normalizedDisplayName);
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to join the room.'));
    } finally {
      this.joining.set(false);
    }
  }

  async sendComment(text: string): Promise<boolean> {
    const normalizedText = text.trim();
    if (!normalizedText || !this.connected()) return false;

    this.sendingComment.set(true);
    this.error.set(null);

    try {
      await this.media.sendComment(normalizedText);
      return true;
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to send comment.'));
      return false;
    } finally {
      this.sendingComment.set(false);
    }
  }

  async toggleRaisedHand(): Promise<void> {
    const context = this.actionContext();
    if (!context) return;

    await this.runAction(
      () => this.api.setRaisedHand(
        { roomId: context.roomId, raised: !this.raisedHand() },
        this.identity.userId,
        context.displayName,
      ),
      'Unable to update your hand state.',
    );
  }

  async featureParticipant(participantId: string): Promise<void> {
    const context = this.actionContext();
    if (!context) return;

    if (!this.hasCamera(participantId)) {
      this.error.set('This participant does not currently have a camera on.');
      return;
    }

    this.error.set(null);

    try {
      await this.api.setFeaturedParticipant(
        { roomId: context.roomId, participantId },
        this.identity.userId,
        context.displayName,
      );
      this.media.setFeaturedParticipant(participantId);
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to feature this participant.'));
    }
  }

  hasCamera(participantId: string): boolean {
    return this.videoTracks().some(
      (tile) => tile.participantIdentity === participantId && tile.source === Track.Source.Camera,
    );
  }

  async promoteToSpeaker(participantId: string): Promise<void> {
    await this.updateRole(participantId, 'speaker');
  }

  async moveToAudience(participantId: string): Promise<void> {
    await this.updateRole(participantId, 'listener');
  }

  async removeParticipant(participantId: string): Promise<void> {
    const context = this.actionContext();
    if (!context) return;

    await this.runAction(
      () => this.api.removeParticipant(
        { roomId: context.roomId, participantId },
        this.identity.userId,
        context.displayName,
      ),
      'Unable to remove participant from the room.',
    );
  }

  async toggleMicrophone(): Promise<void> {
    await this.runAction(
      () => this.media.setMicrophone(!this.microphoneEnabled()),
      'Unable to change microphone state.',
    );
  }

  async toggleCamera(): Promise<void> {
    await this.runAction(
      () => this.media.setCamera(!this.cameraEnabled()),
      'Unable to change camera state.',
    );
  }

  async toggleScreenShare(): Promise<void> {
    await this.runAction(
      () => this.media.setScreenShare(!this.screenSharing()),
      'Unable to change screen sharing state.',
    );
  }

  async resumeAudio(): Promise<void> {
    await this.runAction(() => this.media.resumeAudio(), 'Unable to start room audio.');
  }

  leave(): void {
    this.media.disconnect();
    this.participant.set(null);
    this.roomId.set(null);
    this.joinedDisplayName.set(null);
    this.error.set(null);
  }

  private async updateRole(participantId: string, role: ParticipantRole): Promise<void> {
    const context = this.actionContext();
    if (!context) return;

    await this.runAction(
      () => this.api.updateParticipantRole(
        { roomId: context.roomId, participantId, role },
        this.identity.userId,
        context.displayName,
      ),
      'Unable to update participant role.',
    );
  }

  private actionContext(): { roomId: string; displayName: string } | null {
    const roomId = this.roomId();
    const displayName = this.joinedDisplayName();
    return roomId && displayName ? { roomId, displayName } : null;
  }

  private validateIdentity(roomId: string, displayName: string): boolean {
    if (roomId && displayName) return true;
    this.error.set('Choose your display name on Home before joining a room.');
    return false;
  }

  private async runAction<T>(action: () => Promise<T>, fallbackMessage: string): Promise<void> {
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
}
