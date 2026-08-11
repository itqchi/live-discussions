import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type {
  JoinRoomRequest,
  JoinRoomResponse,
  ModeratedParticipantRole,
  ParticipantRole,
  RoomCommentHistoryItem,
  RoomReactionEmoji,
  UpdateRoomSettingsRequest,
} from '@live-discussions/contracts';
import { Track } from 'livekit-client';
import { DevIdentityService } from '../../../core/dev-identity.service';
import { RoomNavigationService } from '../../../core/room-navigation.service';
import { RoomApiService } from './room-api.service';
import { RoomMediaService, type RoomComment, type VideoTile } from './room-media.service';

const SHARED_ROOM_RECONCILE_INTERVAL_MS = 10_000;

@Injectable()
export class RoomFacade {
  private readonly api = inject(RoomApiService);
  private readonly media = inject(RoomMediaService);
  private readonly identity = inject(DevIdentityService);
  private readonly navigation = inject(RoomNavigationService);
  private readonly router = inject(Router);
  private returningToOrigin = false;
  private joinAttempt = 0;

  readonly connected = this.media.connected.asReadonly();
  readonly connectionStatus = this.media.connectionStatus.asReadonly();
  readonly microphoneEnabled = this.media.microphoneEnabled.asReadonly();
  readonly cameraEnabled = this.media.cameraEnabled.asReadonly();
  readonly screenSharing = this.media.screenSharing.asReadonly();
  readonly audioPlaybackBlocked = this.media.audioPlaybackBlocked.asReadonly();
  readonly participants = this.media.participants.asReadonly();
  readonly comments = this.media.comments.asReadonly();
  readonly stageReactions = this.media.stageReactions.asReadonly();
  readonly videoTracks = this.media.videoTracks.asReadonly();
  readonly featuredParticipantId = this.media.featuredParticipantId.asReadonly();
  readonly displayName = this.identity.displayName;

  readonly joining = signal(false);
  readonly sendingComment = signal(false);
  readonly savingSettings = signal(false);
  readonly closingRoom = signal(false);
  readonly error = signal<string | null>(null);
  readonly participant = signal<JoinRoomResponse['participant'] | null>(null);
  readonly roomTitle = signal<string | null>(null);
  readonly roomSlug = signal<string | null>(null);
  readonly roomDescription = signal('');
  readonly roomLocked = signal(false);
  readonly pinnedCommentIds = signal<ReadonlySet<string>>(new Set());

  private readonly roomId = signal<string | null>(null);

  readonly localPresence = computed(() =>
    this.participants().find((participant) => participant.isLocal) ?? null,
  );
  readonly currentRole = computed<ParticipantRole>(() =>
    this.localPresence()?.role ?? this.participant()?.role ?? 'listener',
  );
  readonly isLocalOnStage = computed(() =>
    this.localPresence()?.onStage ?? this.participant()?.onStage ?? false,
  );
  readonly canPublishAudio = computed(() =>
    this.currentRole() !== 'listener' && this.isLocalOnStage(),
  );
  readonly canPublishVideo = computed(() =>
    this.currentRole() !== 'listener' && this.isLocalOnStage(),
  );
  readonly canShareScreen = computed(() =>
    this.currentRole() !== 'listener' && this.isLocalOnStage(),
  );
  readonly canModerate = computed(() =>
    this.currentRole() === 'owner' || this.currentRole() === 'moderator',
  );
  readonly canEditRoomSettings = this.canModerate;
  readonly canCloseRoom = this.canModerate;
  readonly raisedHand = computed(() => this.localPresence()?.raisedHand ?? false);
  readonly roleLabel = computed(() => this.currentRole());
  readonly pinnedComments = computed(() => {
    const pinnedIds = this.pinnedCommentIds();
    return this.comments().filter((comment) => pinnedIds.has(comment.id));
  });

  readonly ownerParticipant = computed(() =>
    this.participants().find((participant) => participant.role === 'owner') ?? null,
  );
  readonly stageParticipants = computed(() =>
    this.participants().filter((participant) => participant.onStage),
  );
  readonly audienceParticipants = computed(() =>
    this.participants().filter((participant) => !participant.onStage),
  );

  readonly effectiveFeaturedParticipantId = computed(() => {
    const explicit = this.featuredParticipantId();
    if (explicit && this.participants().some((participant) => participant.identity === explicit)) {
      return explicit;
    }

    const owner = this.ownerParticipant();
    if (owner?.onStage) return owner.identity;

    return this.stageParticipants()[0]?.identity ?? null;
  });

  readonly featuredParticipant = computed(() => {
    const participantId = this.effectiveFeaturedParticipantId();
    return participantId
      ? this.participants().find((participant) => participant.identity === participantId) ?? null
      : null;
  });

  readonly featuredVisualTrack = computed(() => {
    const participantId = this.effectiveFeaturedParticipantId();
    return participantId ? this.visualTrackFor(participantId) : null;
  });

  readonly secondaryStageParticipants = computed(() => {
    const featuredId = this.effectiveFeaturedParticipantId();
    return this.stageParticipants().filter((participant) => participant.identity !== featuredId);
  });

  constructor() {
    effect(() => {
      if (this.media.roomDeleted() && !this.closingRoom()) {
        void this.returnToOrigin();
      }
    });

    effect((onCleanup) => {
      const roomId = this.roomId();
      if (!roomId || !this.connected()) return;

      const interval = setInterval(
        () => void this.reconcileSharedRoomState(roomId),
        SHARED_ROOM_RECONCILE_INTERVAL_MS,
      );
      onCleanup(() => clearInterval(interval));
    });
  }

  async loadRoomDetails(roomId: string): Promise<void> {
    const normalizedRoomId = roomId.trim();
    if (!normalizedRoomId) return;

    try {
      const room = await this.api.getRoom(normalizedRoomId);
      this.applyRoomSummary(room);
      if (!this.roomId()) this.roomId.set(normalizedRoomId);
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to load room details.'));
    }
  }

  async join(roomId: string, displayName: string): Promise<void> {
    const normalizedRoomId = roomId.trim();
    const normalizedDisplayName = displayName.trim();
    if (!this.validateIdentity(normalizedRoomId, normalizedDisplayName)) return;
    if (this.joining() || this.connected()) return;

    const attempt = ++this.joinAttempt;
    this.joining.set(true);
    this.error.set(null);
    const request: JoinRoomRequest = { roomId: normalizedRoomId };

    try {
      this.returningToOrigin = false;
      this.identity.setDisplayName(normalizedDisplayName);
      this.roomId.set(normalizedRoomId);

      const summary = await this.api.getRoom(normalizedRoomId);
      if (attempt !== this.joinAttempt) return;
      this.applyRoomSummary(summary);

      const session = await this.api.joinRoom(request);
      if (attempt !== this.joinAttempt) return;

      await this.media.connect(session);
      if (attempt !== this.joinAttempt) {
        await this.disconnectMediaSafely();
        return;
      }

      this.participant.set(session.participant);
      this.roomTitle.set(session.roomTitle);
      this.roomSlug.set(session.roomSlug);

      try {
        const history = await this.api.listComments(session.roomId);
        if (attempt === this.joinAttempt) {
          this.media.hydrateComments(history);
          this.applyPinnedHistory(history);
        }
      } catch {
        if (attempt === this.joinAttempt) {
          this.error.set('Room connected, but shared comment history could not be loaded.');
        }
      }
    } catch (error) {
      if (attempt !== this.joinAttempt) return;
      this.participant.set(null);
      await this.disconnectMediaSafely();
      if (!this.roomTitle()) this.resetRoomSession();
      this.error.set(this.errorMessage(error, 'Unable to join the room.'));
    } finally {
      if (attempt === this.joinAttempt) this.joining.set(false);
    }
  }

  async switchRoom(roomId: string, displayName: string): Promise<void> {
    const normalizedRoomId = roomId.trim();
    const normalizedDisplayName = displayName.trim();
    if (this.roomId() === normalizedRoomId && (this.connected() || this.joining())) return;

    ++this.joinAttempt;
    this.joining.set(false);
    this.returningToOrigin = false;
    await this.disconnectMediaSafely();
    this.resetRoomSession();
    this.error.set(null);

    if (!normalizedRoomId) return;
    if (normalizedDisplayName) {
      await this.join(normalizedRoomId, normalizedDisplayName);
    } else {
      await this.loadRoomDetails(normalizedRoomId);
    }
  }

  async updateRoomSettings(request: UpdateRoomSettingsRequest): Promise<boolean> {
    const roomId = this.roomId();
    if (!roomId || !this.canEditRoomSettings() || this.savingSettings()) return false;

    this.savingSettings.set(true);
    this.error.set(null);
    try {
      const room = await this.api.updateRoomSettings(roomId, request);
      this.applyRoomSummary(room);
      return true;
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to update room settings.'));
      return false;
    } finally {
      this.savingSettings.set(false);
    }
  }

  async closeRoom(): Promise<boolean> {
    const roomId = this.roomId();
    if (!roomId || !this.canCloseRoom() || this.closingRoom()) return false;

    this.closingRoom.set(true);
    this.error.set(null);

    try {
      await this.api.closeRoom({ roomId });
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to close the room.'));
      this.closingRoom.set(false);
      return false;
    }

    ++this.joinAttempt;
    await this.disconnectMediaSafely();

    try {
      await this.returnToOrigin();
      return true;
    } finally {
      this.closingRoom.set(false);
    }
  }

  async leave(): Promise<void> {
    ++this.joinAttempt;
    this.joining.set(false);
    await this.disconnectMediaSafely();
    await this.returnToOrigin();
  }

  async sendComment(text: string, replyToId: string | null = null): Promise<boolean> {
    const normalizedText = text.trim();
    const roomId = this.roomId();
    if (!normalizedText || !roomId || !this.connected()) return false;

    this.sendingComment.set(true);
    this.error.set(null);
    try {
      const comment = await this.media.sendComment(normalizedText, replyToId);
      try {
        await this.api.createComment(roomId, {
          id: comment.id,
          text: comment.text,
          replyToId: comment.replyToId,
        });
      } catch {
        this.error.set('Comment was sent live, but could not be saved to shared history.');
      }
      return true;
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to send comment.'));
      return false;
    } finally {
      this.sendingComment.set(false);
    }
  }

  async toggleCommentReaction(commentId: string, emoji: RoomReactionEmoji): Promise<void> {
    const roomId = this.roomId();
    if (!roomId) return;

    this.error.set(null);
    try {
      const active = await this.media.toggleCommentReaction(commentId, emoji);
      try {
        await this.api.setCommentReaction(roomId, commentId, { emoji, active });
      } catch {
        this.error.set('Reaction was sent live, but could not be saved to shared history.');
      }
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to react to this comment.'));
    }
  }

  async toggleCommentPinned(commentId: string): Promise<void> {
    const roomId = this.roomId();
    if (!roomId || !this.canModerate()) return;

    const pinned = !this.pinnedCommentIds().has(commentId);
    this.error.set(null);
    try {
      await this.api.setCommentPinned(roomId, commentId, { pinned });
      this.pinnedCommentIds.update((current) => {
        const next = new Set(current);
        if (pinned) next.add(commentId);
        else next.delete(commentId);
        return next;
      });
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to update the pinned comment.'));
    }
  }

  isCommentPinned(commentId: string): boolean {
    return this.pinnedCommentIds().has(commentId);
  }

  sendStageReaction(emoji: RoomReactionEmoji): Promise<void> {
    return this.runAction(
      () => this.media.sendStageReaction(emoji),
      'Unable to send reaction.',
    );
  }

  commentById(commentId: string | null): RoomComment | null {
    return commentId ? this.comments().find((comment) => comment.id === commentId) ?? null : null;
  }

  stageReactionFor(participantId: string): RoomReactionEmoji | null {
    return this.stageReactions()[participantId]?.emoji ?? null;
  }

  visualTrackFor(participantId: string): VideoTile | null {
    const tracks = this.videoTracks().filter((tile) => tile.participantIdentity === participantId);
    return tracks.find((tile) => tile.source === Track.Source.ScreenShare)
      ?? tracks.find((tile) => tile.source === Track.Source.Camera)
      ?? null;
  }

  async setSelfOnStage(onStage: boolean): Promise<void> {
    const roomId = this.roomId();
    if (!roomId || !this.connected()) return;

    await this.runAction(
      () => this.api.setStagePresence({ roomId, onStage }),
      'Unable to update your stage position.',
    );
  }

  async toggleRaisedHand(): Promise<void> {
    const roomId = this.roomId();
    if (!roomId) return;

    await this.runAction(
      () => this.api.setRaisedHand({ roomId, raised: !this.raisedHand() }),
      'Unable to update your hand state.',
    );
  }

  async featureParticipant(participantId: string): Promise<void> {
    const roomId = this.roomId();
    if (!roomId) return;

    this.error.set(null);
    try {
      await this.api.setFeaturedParticipant({ roomId, participantId });
      this.media.setFeaturedParticipant(participantId);
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to feature this participant.'));
    }
  }

  async returnOwnerToFeaturedSpot(): Promise<void> {
    const roomId = this.roomId();
    if (!roomId) return;

    this.error.set(null);
    try {
      await this.api.setFeaturedParticipant({ roomId, participantId: null });
      this.media.setFeaturedParticipant(null);
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to restore the default featured spot.'));
    }
  }

  isFeatured(participantId: string): boolean {
    return this.effectiveFeaturedParticipantId() === participantId;
  }

  async promoteToSpeaker(participantId: string): Promise<void> {
    await this.updateRole(participantId, 'speaker');
  }

  async moveToAudience(participantId: string): Promise<void> {
    await this.updateRole(participantId, 'listener');
  }

  async removeParticipant(participantId: string): Promise<void> {
    const roomId = this.roomId();
    if (!roomId) return;

    await this.runAction(
      () => this.api.removeParticipant({ roomId, participantId }),
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
    await this.runAction(
      () => this.media.resumeAudio(),
      'Unable to start room audio.',
    );
  }

  private async returnToOrigin(): Promise<void> {
    if (this.returningToOrigin) return;

    const roomSlug = this.roomId();
    if (!roomSlug) return;

    this.returningToOrigin = true;
    const origin = this.navigation.originFor(roomSlug);

    try {
      const navigated = await this.router.navigateByUrl(origin);
      if (!navigated) {
        this.error.set('Unable to leave this room. Please try again.');
        return;
      }

      this.navigation.clearOrigin(roomSlug);
      this.resetRoomSession();
      this.error.set(null);
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to leave this room. Please try again.'));
    } finally {
      this.returningToOrigin = false;
    }
  }

  private async updateRole(participantId: string, role: ModeratedParticipantRole): Promise<void> {
    const roomId = this.roomId();
    if (!roomId) return;

    await this.runAction(
      () => this.api.updateParticipantRole({ roomId, participantId, role }),
      'Unable to update participant role.',
    );
  }

  private async reconcileSharedRoomState(roomId: string): Promise<void> {
    try {
      const [room, history] = await Promise.all([
        this.api.getRoom(roomId),
        this.api.listComments(roomId),
      ]);
      if (this.roomId() !== roomId || !this.connected()) return;

      this.applyRoomSummary(room);
      this.media.hydrateComments(history);
      this.applyPinnedHistory(history);
    } catch {
      // Realtime media remains usable; the next reconciliation attempt can recover shared state.
    }
  }

  private applyPinnedHistory(history: RoomCommentHistoryItem[]): void {
    this.pinnedCommentIds.set(new Set(
      history.filter((comment) => comment.pinned).map((comment) => comment.id),
    ));
  }

  private applyRoomSummary(room: {
    slug: string;
    title: string;
    description: string;
    isLocked: boolean;
  }): void {
    this.roomSlug.set(room.slug);
    this.roomTitle.set(room.title);
    this.roomDescription.set(room.description);
    this.roomLocked.set(room.isLocked);
  }

  private resetRoomSession(): void {
    this.participant.set(null);
    this.roomTitle.set(null);
    this.roomSlug.set(null);
    this.roomDescription.set('');
    this.roomLocked.set(false);
    this.pinnedCommentIds.set(new Set());
    this.roomId.set(null);
  }

  private async disconnectMediaSafely(): Promise<void> {
    try {
      await this.media.disconnect();
    } catch {
      // RoomMediaService.disconnect() performs local cleanup in a finally block.
    }
  }

  private validateIdentity(roomId: string, displayName: string): boolean {
    if (roomId && displayName) return true;
    this.error.set('Choose a display name before joining the room.');
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
