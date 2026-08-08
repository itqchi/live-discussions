import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { JoinRoomRequest, JoinRoomResponse, ParticipantRole } from '@live-discussions/contracts';
import { Track } from 'livekit-client';
import { DevIdentityService } from '../../../core/dev-identity.service';
import { RoomNavigationService } from '../../../core/room-navigation.service';
import { RoomApiService } from './room-api.service';
import { RoomMediaService, type RoomComment, type VideoTile } from './room-media.service';

@Injectable()
export class RoomFacade {
  private readonly api = inject(RoomApiService);
  private readonly media = inject(RoomMediaService);
  private readonly identity = inject(DevIdentityService);
  private readonly navigation = inject(RoomNavigationService);
  private readonly router = inject(Router);
  private returningToOrigin = false;

  readonly connected = this.media.connected.asReadonly();
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
  readonly creating = signal(false);
  readonly sendingComment = signal(false);
  readonly closingRoom = signal(false);
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
  readonly canCloseRoom = this.canModerate;
  readonly raisedHand = computed(() => this.localPresence()?.raisedHand ?? false);
  readonly roleLabel = computed(() => this.currentRole());
  readonly isLocalOnStage = computed(() => this.localPresence()?.onStage ?? false);

  readonly ownerParticipant = computed(() => this.participants().find((participant) => participant.role === 'owner') ?? null);
  readonly stageParticipants = computed(() => this.participants().filter((participant) => participant.onStage));
  readonly audienceParticipants = computed(() => this.participants().filter((participant) => !participant.onStage));

  readonly effectiveFeaturedParticipantId = computed(() => {
    const explicit = this.featuredParticipantId();
    if (explicit && this.participants().some((participant) => participant.identity === explicit)) return explicit;
    const owner = this.ownerParticipant();
    if (owner?.onStage) return owner.identity;
    return this.stageParticipants()[0]?.identity ?? null;
  });

  readonly featuredParticipant = computed(() => {
    const participantId = this.effectiveFeaturedParticipantId();
    return participantId ? this.participants().find((participant) => participant.identity === participantId) ?? null : null;
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
      if (this.media.roomDeleted()) void this.returnToOrigin();
    });
  }

  async createAndJoin(roomId: string, displayName: string): Promise<void> {
    const normalizedRoomId = roomId.trim();
    const normalizedDisplayName = displayName.trim();
    if (!this.validateIdentity(normalizedRoomId, normalizedDisplayName)) return;
    this.creating.set(true);
    this.error.set(null);
    try {
      this.identity.setDisplayName(normalizedDisplayName);
      await this.api.createRoom({ roomId: normalizedRoomId, title: normalizedRoomId }, this.identity.userId, normalizedDisplayName);
      await this.join(normalizedRoomId, normalizedDisplayName);
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to create the room.'));
    } finally { this.creating.set(false); }
  }

  async join(roomId: string, displayName: string): Promise<void> {
    const normalizedRoomId = roomId.trim();
    const normalizedDisplayName = displayName.trim();
    if (!this.validateIdentity(normalizedRoomId, normalizedDisplayName)) return;
    this.joining.set(true);
    this.error.set(null);
    const request: JoinRoomRequest = { roomId: normalizedRoomId };
    try {
      this.returningToOrigin = false;
      this.roomId.set(normalizedRoomId);
      this.joinedDisplayName.set(normalizedDisplayName);
      const session = await this.api.joinRoom(request, this.identity.userId, normalizedDisplayName);
      await this.media.connect(session);
      this.participant.set(session.participant);
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to join the room.'));
    } finally { this.joining.set(false); }
  }

  async closeRoom(): Promise<boolean> {
    const context = this.actionContext();
    if (!context || !this.canCloseRoom()) return false;
    this.closingRoom.set(true);
    this.error.set(null);
    try {
      await this.api.closeRoom({ roomId: context.roomId }, this.identity.userId, context.displayName);
      await this.media.disconnect();
      await this.returnToOrigin();
      return true;
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to close the room.'));
      return false;
    } finally { this.closingRoom.set(false); }
  }

  async leave(): Promise<void> {
    await this.media.disconnect();
    await this.returnToOrigin();
  }

  async sendComment(text: string, replyToId: string | null = null): Promise<boolean> {
    const normalizedText = text.trim();
    if (!normalizedText || !this.connected()) return false;
    this.sendingComment.set(true);
    this.error.set(null);
    try {
      await this.media.sendComment(normalizedText, replyToId);
      return true;
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to send comment.'));
      return false;
    } finally { this.sendingComment.set(false); }
  }

  toggleCommentReaction(commentId: string, emoji: string): Promise<void> {
    return this.runAction(() => this.media.toggleCommentReaction(commentId, emoji), 'Unable to react to this comment.');
  }

  sendStageReaction(emoji: string): Promise<void> {
    return this.runAction(() => this.media.sendStageReaction(emoji), 'Unable to send reaction.');
  }

  commentById(commentId: string | null): RoomComment | null {
    return commentId ? this.comments().find((comment) => comment.id === commentId) ?? null : null;
  }

  stageReactionFor(participantId: string): string | null { return this.stageReactions()[participantId]?.emoji ?? null; }

  visualTrackFor(participantId: string): VideoTile | null {
    const tracks = this.videoTracks().filter((tile) => tile.participantIdentity === participantId);
    return tracks.find((tile) => tile.source === Track.Source.ScreenShare)
      ?? tracks.find((tile) => tile.source === Track.Source.Camera)
      ?? null;
  }

  async setSelfOnStage(onStage: boolean): Promise<void> {
    const context = this.actionContext();
    if (!context || !this.connected()) return;
    await this.runAction(
      () => this.api.setStagePresence({ roomId: context.roomId, onStage }, this.identity.userId, context.displayName),
      'Unable to update your stage position.',
    );
  }

  async toggleRaisedHand(): Promise<void> {
    const context = this.actionContext();
    if (!context) return;
    await this.runAction(
      () => this.api.setRaisedHand({ roomId: context.roomId, raised: !this.raisedHand() }, this.identity.userId, context.displayName),
      'Unable to update your hand state.',
    );
  }

  async featureParticipant(participantId: string): Promise<void> {
    const context = this.actionContext();
    if (!context) return;
    this.error.set(null);
    try {
      await this.api.setFeaturedParticipant({ roomId: context.roomId, participantId }, this.identity.userId, context.displayName);
      this.media.setFeaturedParticipant(participantId);
    } catch (error) { this.error.set(this.errorMessage(error, 'Unable to feature this participant.')); }
  }

  async returnOwnerToFeaturedSpot(): Promise<void> {
    const context = this.actionContext();
    if (!context) return;
    this.error.set(null);
    try {
      await this.api.setFeaturedParticipant({ roomId: context.roomId, participantId: null }, this.identity.userId, context.displayName);
      this.media.setFeaturedParticipant(null);
    } catch (error) { this.error.set(this.errorMessage(error, 'Unable to restore the default featured spot.')); }
  }

  isFeatured(participantId: string): boolean { return this.effectiveFeaturedParticipantId() === participantId; }

  async promoteToSpeaker(participantId: string): Promise<void> { await this.updateRole(participantId, 'speaker'); }
  async moveToAudience(participantId: string): Promise<void> { await this.updateRole(participantId, 'listener'); }

  async removeParticipant(participantId: string): Promise<void> {
    const context = this.actionContext();
    if (!context) return;
    await this.runAction(
      () => this.api.removeParticipant({ roomId: context.roomId, participantId }, this.identity.userId, context.displayName),
      'Unable to remove participant from the room.',
    );
  }

  async toggleMicrophone(): Promise<void> {
    await this.runAction(() => this.media.setMicrophone(!this.microphoneEnabled()), 'Unable to change microphone state.');
  }
  async toggleCamera(): Promise<void> {
    await this.runAction(() => this.media.setCamera(!this.cameraEnabled()), 'Unable to change camera state.');
  }
  async toggleScreenShare(): Promise<void> {
    await this.runAction(() => this.media.setScreenShare(!this.screenSharing()), 'Unable to change screen sharing state.');
  }
  async resumeAudio(): Promise<void> { await this.runAction(() => this.media.resumeAudio(), 'Unable to start room audio.'); }

  private async returnToOrigin(): Promise<void> {
    if (this.returningToOrigin) return;
    const roomSlug = this.roomId();
    if (!roomSlug) return;
    this.returningToOrigin = true;
    const origin = this.navigation.consumeOrigin(roomSlug);
    this.participant.set(null);
    this.error.set(null);
    try {
      await this.router.navigateByUrl(origin);
    } finally {
      this.roomId.set(null);
      this.joinedDisplayName.set(null);
      this.returningToOrigin = false;
    }
  }

  private async updateRole(participantId: string, role: ParticipantRole): Promise<void> {
    const context = this.actionContext();
    if (!context) return;
    await this.runAction(
      () => this.api.updateParticipantRole({ roomId: context.roomId, participantId, role }, this.identity.userId, context.displayName),
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
    try { await action(); } catch (error) { this.error.set(this.errorMessage(error, fallbackMessage)); }
  }

  private errorMessage(error: unknown, fallbackMessage: string): string {
    return error instanceof Error && error.message ? error.message : fallbackMessage;
  }
}
