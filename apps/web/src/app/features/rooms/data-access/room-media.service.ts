import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import {
  isRoomReactionEmoji,
  type JoinRoomResponse,
  type ParticipantRole,
  type RoomReactionEmoji,
} from '@live-discussions/contracts';
import {
  DisconnectReason,
  type LocalVideoTrack,
  type Participant,
  type RemoteAudioTrack,
  type RemoteVideoTrack,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client';
import { BrowserStorageService } from '../../../core/browser-storage.service';

export type RoomConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface RoomPresenceParticipant {
  identity: string;
  name: string;
  role: ParticipantRole;
  raisedHand: boolean;
  onStage: boolean;
  isSpeaking: boolean;
  isLocal: boolean;
}

export interface RoomComment {
  id: string;
  participantIdentity: string;
  participantName: string;
  text: string;
  timestamp: number;
  isLocal: boolean;
  replyToId: string | null;
  reactions: Record<string, string[]>;
}

export interface StageReaction {
  id: string;
  participantIdentity: string;
  emoji: RoomReactionEmoji;
}

export interface VideoTile {
  id: number;
  participantIdentity: string;
  participantName: string;
  isLocal: boolean;
  source: Track.Source;
  track: LocalVideoTrack | RemoteVideoTrack;
}

interface LiveRoomMetadata {
  featuredParticipantId?: string;
}

const COMMENTS_TOPIC = 'live-discussions.comments';
const COMMENT_REACTIONS_TOPIC = 'live-discussions.comment-reactions';
const STAGE_REACTIONS_TOPIC = 'live-discussions.stage-reactions';
const COMMENTS_CACHE_PREFIX = 'live-discussions.room-comments.';
const MAX_CACHED_COMMENTS = 200;
const MAX_COMMENT_LENGTH = 1000;
const MAX_REPLY_ID_LENGTH = 160;
const STAGE_REACTION_DURATION_MS = 3500;

@Injectable()
export class RoomMediaService {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly storage = inject(BrowserStorageService);
  private readonly room = new Room();
  private readonly audioElements = new Map<RemoteAudioTrack, HTMLMediaElement>();
  private readonly stageReactionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private nextVideoTileId = 1;

  readonly connected = signal(false);
  readonly connectionStatus = signal<RoomConnectionStatus>('disconnected');
  readonly roomDeleted = signal(false);
  readonly microphoneEnabled = signal(false);
  readonly cameraEnabled = signal(false);
  readonly screenSharing = signal(false);
  readonly audioPlaybackBlocked = signal(false);
  readonly participants = signal<RoomPresenceParticipant[]>([]);
  readonly comments = signal<RoomComment[]>([]);
  readonly stageReactions = signal<Record<string, StageReaction>>({});
  readonly videoTracks = signal<VideoTile[]>([]);
  readonly featuredParticipantId = signal<string | null>(null);

  constructor() {
    this.room.registerTextStreamHandler(COMMENTS_TOPIC, async (reader, participantInfo) => {
      const text = (await reader.readAll()).trim();
      if (!text || text.length > MAX_COMMENT_LENGTH) return;

      const rawReplyToId = reader.info.attributes?.['replyToId'];
      const replyToId = rawReplyToId && rawReplyToId.length <= MAX_REPLY_ID_LENGTH
        ? rawReplyToId
        : null;

      this.appendComment({
        id: reader.info.id,
        participantIdentity: participantInfo.identity,
        participantName: this.participantName(participantInfo.identity),
        text,
        timestamp: reader.info.timestamp,
        isLocal: false,
        replyToId,
        reactions: {},
      });
    });

    this.room.registerTextStreamHandler(COMMENT_REACTIONS_TOPIC, async (reader, participantInfo) => {
      const emoji = (await reader.readAll()).trim();
      const commentId = reader.info.attributes?.['commentId'];
      const action = reader.info.attributes?.['action'] === 'remove' ? 'remove' : 'add';
      if (isRoomReactionEmoji(emoji) && commentId) {
        this.applyCommentReaction(commentId, emoji, participantInfo.identity, action);
      }
    });

    this.room.registerTextStreamHandler(STAGE_REACTIONS_TOPIC, async (reader, participantInfo) => {
      const emoji = (await reader.readAll()).trim();
      if (isRoomReactionEmoji(emoji)) {
        this.showStageReaction(participantInfo.identity, emoji, reader.info.id);
      }
    });

    this.room.on(RoomEvent.Connected, () => {
      this.roomDeleted.set(false);
      this.connected.set(true);
      this.connectionStatus.set('connected');
      this.restoreCachedComments();
      this.syncAudioPlaybackState();
      this.syncParticipants();
      this.syncRoomMetadata(this.room.metadata);
      this.syncLocalMediaState();
    });

    this.room.on(RoomEvent.Reconnecting, () => {
      this.connectionStatus.set('reconnecting');
    });

    this.room.on(RoomEvent.Reconnected, () => {
      this.connected.set(true);
      this.connectionStatus.set('connected');
      this.syncAudioPlaybackState();
      this.syncParticipants();
      this.syncRoomMetadata(this.room.metadata);
      this.syncLocalMediaState();
    });

    this.room.on(RoomEvent.AudioPlaybackStatusChanged, () => this.syncAudioPlaybackState());
    this.room.on(RoomEvent.ParticipantConnected, () => this.syncParticipants());
    this.room.on(RoomEvent.ParticipantAttributesChanged, () => this.syncParticipants());
    this.room.on(RoomEvent.ParticipantMetadataChanged, () => this.syncParticipants());
    this.room.on(RoomEvent.ParticipantNameChanged, () => this.syncParticipants());
    this.room.on(RoomEvent.ParticipantPermissionsChanged, () => this.syncParticipants());
    this.room.on(RoomEvent.ActiveSpeakersChanged, () => this.syncParticipants());
    this.room.on(RoomEvent.RoomMetadataChanged, (metadata) => this.syncRoomMetadata(metadata));

    this.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === Track.Kind.Audio) {
        this.attachAudioTrack(track as RemoteAudioTrack);
        return;
      }
      if (track.kind !== Track.Kind.Video) return;

      this.addVideoTrack(
        track as RemoteVideoTrack,
        participant.identity,
        participant.name || participant.identity,
        false,
        publication.source,
      );
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) {
        this.detachAudioTrack(track as RemoteAudioTrack);
        return;
      }
      this.removeVideoTrack(track);
    });

    this.room.on(RoomEvent.LocalTrackPublished, (publication, participant) => {
      const track = publication.track;
      if (track?.kind === Track.Kind.Video) {
        this.addVideoTrack(
          track as LocalVideoTrack,
          participant.identity,
          participant.name || participant.identity,
          true,
          publication.source,
        );
      }
      this.syncLocalMediaState();
    });

    this.room.on(RoomEvent.LocalTrackUnpublished, (publication) => {
      if (publication.track) this.removeVideoTrack(publication.track);
      this.syncLocalMediaState();
    });

    this.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      this.videoTracks.update((tiles) =>
        tiles.filter((tile) => tile.participantIdentity !== participant.identity),
      );
      this.syncParticipants();
    });

    this.room.on(RoomEvent.Disconnected, (reason) => {
      const deleted = reason === DisconnectReason.ROOM_DELETED;
      this.resetMediaState();
      if (deleted) this.roomDeleted.set(true);
    });

    this.destroyRef.onDestroy(() => {
      this.room.unregisterTextStreamHandler(COMMENTS_TOPIC);
      this.room.unregisterTextStreamHandler(COMMENT_REACTIONS_TOPIC);
      this.room.unregisterTextStreamHandler(STAGE_REACTIONS_TOPIC);
      this.room.removeAllListeners();
      this.cleanupAudioTracks();
      this.cleanupVideoTracks();
      this.clearStageReactionTimers();
      void this.room.disconnect(true);
    });
  }

  async connect(session: JoinRoomResponse): Promise<void> {
    this.connectionStatus.set('connecting');
    try {
      await this.room.connect(session.livekitUrl, session.token);
    } catch (error) {
      this.connectionStatus.set('disconnected');
      throw error;
    }
  }

  setFeaturedParticipant(participantId: string | null): void {
    this.featuredParticipantId.set(participantId);
  }

  async setMicrophone(enabled: boolean): Promise<void> {
    await this.room.localParticipant.setMicrophoneEnabled(enabled);
    this.syncLocalMediaState();
  }

  async setCamera(enabled: boolean): Promise<void> {
    await this.room.localParticipant.setCameraEnabled(enabled);
    this.syncLocalMediaState();
  }

  async setScreenShare(enabled: boolean): Promise<void> {
    const publication = await this.room.localParticipant.setScreenShareEnabled(
      enabled,
      enabled
        ? {
            audio: true,
            systemAudio: 'include',
          }
        : undefined,
    );

    if (enabled && !publication) {
      throw new Error(
        'Screen sharing was not started. Your browser may have cancelled or blocked the share request.',
      );
    }
    this.syncLocalMediaState();
  }

  async sendComment(text: string, replyToId: string | null = null): Promise<void> {
    const normalizedText = text.trim();
    if (!normalizedText || !this.connected()) return;
    if (normalizedText.length > MAX_COMMENT_LENGTH) {
      throw new Error(`Comments can be up to ${MAX_COMMENT_LENGTH} characters.`);
    }
    if (replyToId && replyToId.length > MAX_REPLY_ID_LENGTH) {
      throw new Error('The reply reference is invalid.');
    }

    const info = await this.room.localParticipant.sendText(normalizedText, {
      topic: COMMENTS_TOPIC,
      attributes: replyToId ? { replyToId } : undefined,
    });

    this.appendComment({
      id: info.id,
      participantIdentity: this.room.localParticipant.identity,
      participantName: this.room.localParticipant.name || this.room.localParticipant.identity,
      text: normalizedText,
      timestamp: Date.now(),
      isLocal: true,
      replyToId,
      reactions: {},
    });
  }

  async toggleCommentReaction(commentId: string, emoji: RoomReactionEmoji): Promise<void> {
    const comment = this.comments().find((item) => item.id === commentId);
    if (!comment || !this.connected() || !isRoomReactionEmoji(emoji)) return;

    const identity = this.room.localParticipant.identity;
    const action = comment.reactions[emoji]?.includes(identity) ? 'remove' : 'add';
    await this.room.localParticipant.sendText(emoji, {
      topic: COMMENT_REACTIONS_TOPIC,
      attributes: { commentId, action },
    });
    this.applyCommentReaction(commentId, emoji, identity, action);
  }

  async sendStageReaction(emoji: RoomReactionEmoji): Promise<void> {
    if (!this.connected() || !isRoomReactionEmoji(emoji)) return;

    const info = await this.room.localParticipant.sendText(emoji, {
      topic: STAGE_REACTIONS_TOPIC,
    });
    this.showStageReaction(this.room.localParticipant.identity, emoji, info.id);
  }

  async resumeAudio(): Promise<void> {
    await this.room.startAudio();
    this.syncAudioPlaybackState();
  }

  async disconnect(): Promise<void> {
    this.roomDeleted.set(false);
    this.cleanupAudioTracks();
    this.cleanupVideoTracks();
    this.clearStageReactionTimers();
    this.resetMediaSignals();

    try {
      await this.room.disconnect(true);
    } finally {
      this.cleanupAudioTracks();
      this.cleanupVideoTracks();
      this.resetMediaSignals();
    }
  }

  private appendComment(comment: RoomComment): void {
    this.comments.update((comments) => {
      if (comments.some((existing) => existing.id === comment.id)) return comments;
      const next = [...comments, comment].slice(-MAX_CACHED_COMMENTS);
      this.persistComments(next);
      return next;
    });
  }

  private applyCommentReaction(
    commentId: string,
    emoji: RoomReactionEmoji,
    identity: string,
    action: 'add' | 'remove',
  ): void {
    this.comments.update((comments) => {
      const next = comments.map((comment) => {
        if (comment.id !== commentId) return comment;

        const current = comment.reactions[emoji] ?? [];
        const identities = action === 'add'
          ? current.includes(identity) ? current : [...current, identity]
          : current.filter((item) => item !== identity);
        const reactions = { ...comment.reactions };

        if (identities.length) reactions[emoji] = identities;
        else delete reactions[emoji];

        return { ...comment, reactions };
      });
      this.persistComments(next);
      return next;
    });
  }

  private showStageReaction(
    participantIdentity: string,
    emoji: RoomReactionEmoji,
    id: string,
  ): void {
    const existingTimer = this.stageReactionTimers.get(participantIdentity);
    if (existingTimer) clearTimeout(existingTimer);

    this.stageReactions.update((reactions) => ({
      ...reactions,
      [participantIdentity]: { id, participantIdentity, emoji },
    }));

    this.stageReactionTimers.set(
      participantIdentity,
      setTimeout(() => {
        this.stageReactions.update((reactions) => {
          const next = { ...reactions };
          delete next[participantIdentity];
          return next;
        });
        this.stageReactionTimers.delete(participantIdentity);
      }, STAGE_REACTION_DURATION_MS),
    );
  }

  private clearStageReactionTimers(): void {
    for (const timer of this.stageReactionTimers.values()) clearTimeout(timer);
    this.stageReactionTimers.clear();
    this.stageReactions.set({});
  }

  private restoreCachedComments(): void {
    const roomName = this.room.name;
    if (!roomName) return;

    const cached = this.storage.getLocal(`${COMMENTS_CACHE_PREFIX}${roomName}`);
    if (!cached) {
      this.comments.set([]);
      return;
    }

    try {
      const parsed = JSON.parse(cached) as unknown;
      if (!Array.isArray(parsed)) {
        this.comments.set([]);
        return;
      }

      const normalized = parsed
        .map((comment) => this.normalizeCachedComment(comment))
        .filter((comment): comment is RoomComment => comment !== null)
        .slice(-MAX_CACHED_COMMENTS);

      this.comments.set(normalized);
      this.persistComments(normalized);
    } catch {
      this.comments.set([]);
    }
  }

  private normalizeCachedComment(value: unknown): RoomComment | null {
    if (!value || typeof value !== 'object') return null;

    const comment = value as Partial<RoomComment>;
    if (
      typeof comment.id !== 'string'
      || typeof comment.participantIdentity !== 'string'
      || typeof comment.participantName !== 'string'
      || typeof comment.text !== 'string'
      || comment.text.length > MAX_COMMENT_LENGTH
    ) {
      return null;
    }

    const reactions: Record<string, string[]> = {};
    if (comment.reactions && typeof comment.reactions === 'object') {
      for (const [emoji, identities] of Object.entries(comment.reactions)) {
        if (isRoomReactionEmoji(emoji) && Array.isArray(identities)) {
          reactions[emoji] = identities.filter(
            (identity): identity is string => typeof identity === 'string',
          );
        }
      }
    }

    const replyToId = typeof comment.replyToId === 'string'
      && comment.replyToId.length <= MAX_REPLY_ID_LENGTH
      ? comment.replyToId
      : null;

    return {
      id: comment.id,
      participantIdentity: comment.participantIdentity,
      participantName: comment.participantName,
      text: comment.text,
      timestamp: typeof comment.timestamp === 'number' ? comment.timestamp : Date.now(),
      isLocal: comment.isLocal === true,
      replyToId,
      reactions,
    };
  }

  private persistComments(comments: RoomComment[]): void {
    const roomName = this.room.name;
    if (!roomName) return;
    this.storage.setLocal(`${COMMENTS_CACHE_PREFIX}${roomName}`, JSON.stringify(comments));
  }

  private syncLocalMediaState(): void {
    const publications = [...this.room.localParticipant.trackPublications.values()];
    this.microphoneEnabled.set(
      publications.some(
        (publication) => publication.source === Track.Source.Microphone && !publication.isMuted,
      ),
    );
    this.cameraEnabled.set(
      publications.some(
        (publication) => publication.source === Track.Source.Camera && !publication.isMuted,
      ),
    );
    this.screenSharing.set(
      publications.some(
        (publication) => publication.source === Track.Source.ScreenShare && !publication.isMuted,
      ),
    );
  }

  private syncAudioPlaybackState(): void {
    this.audioPlaybackBlocked.set(!this.room.canPlaybackAudio);
  }

  private syncParticipants(): void {
    if (!this.connected()) {
      this.participants.set([]);
      return;
    }

    const local = this.toPresenceParticipant(this.room.localParticipant, true);
    const remote = [...this.room.remoteParticipants.values()].map((participant) =>
      this.toPresenceParticipant(participant, false),
    );
    this.participants.set([local, ...remote]);
  }

  private syncRoomMetadata(metadata: string | undefined): void {
    if (!metadata) {
      this.featuredParticipantId.set(null);
      return;
    }

    try {
      const featuredParticipantId = (JSON.parse(metadata) as LiveRoomMetadata).featuredParticipantId;
      this.featuredParticipantId.set(
        typeof featuredParticipantId === 'string' && featuredParticipantId
          ? featuredParticipantId
          : null,
      );
    } catch {
      this.featuredParticipantId.set(null);
    }
  }

  private participantName(identity: string): string {
    if (identity === this.room.localParticipant.identity) {
      return this.room.localParticipant.name || identity;
    }
    return this.room.remoteParticipants.get(identity)?.name || identity;
  }

  private toPresenceParticipant(participant: Participant, isLocal: boolean): RoomPresenceParticipant {
    const role = this.roleFromMetadata(participant.metadata);
    const onStageAttribute = participant.attributes['onStage'];

    return {
      identity: participant.identity,
      name: participant.name || participant.identity,
      role,
      raisedHand: participant.attributes['raisedHand'] === 'true',
      onStage: onStageAttribute === undefined ? role !== 'listener' : onStageAttribute === 'true',
      isSpeaking: participant.isSpeaking,
      isLocal,
    };
  }

  private roleFromMetadata(metadata: string | undefined): ParticipantRole {
    if (!metadata) return 'listener';

    try {
      const role = (JSON.parse(metadata) as { role?: string }).role;
      if (role === 'owner' || role === 'moderator' || role === 'speaker' || role === 'listener') {
        return role;
      }
    } catch {
      // Invalid metadata falls back to least privilege.
    }
    return 'listener';
  }

  private attachAudioTrack(track: RemoteAudioTrack): void {
    if (this.audioElements.has(track)) return;

    const element = track.attach();
    element.autoplay = true;
    element.style.display = 'none';
    this.document.body.appendChild(element);
    this.audioElements.set(track, element);
  }

  private detachAudioTrack(track: RemoteAudioTrack): void {
    const element = this.audioElements.get(track);
    if (!element) return;

    track.detach(element);
    this.disposeMediaElement(element);
    this.audioElements.delete(track);
  }

  private cleanupAudioTracks(): void {
    for (const [track, element] of this.audioElements) {
      track.detach(element);
      this.disposeMediaElement(element);
    }
    this.audioElements.clear();
  }

  private disposeMediaElement(element: HTMLMediaElement): void {
    element.pause();
    element.removeAttribute('src');
    element.load();
    element.remove();
  }

  private cleanupVideoTracks(): void {
    for (const tile of this.videoTracks()) tile.track.detach();
    this.videoTracks.set([]);
  }

  private resetMediaState(): void {
    this.cleanupAudioTracks();
    this.cleanupVideoTracks();
    this.clearStageReactionTimers();
    this.resetMediaSignals();
  }

  private resetMediaSignals(): void {
    this.connected.set(false);
    this.connectionStatus.set('disconnected');
    this.microphoneEnabled.set(false);
    this.cameraEnabled.set(false);
    this.screenSharing.set(false);
    this.audioPlaybackBlocked.set(false);
    this.participants.set([]);
    this.featuredParticipantId.set(null);
  }

  private addVideoTrack(
    track: LocalVideoTrack | RemoteVideoTrack,
    participantIdentity: string,
    participantName: string,
    isLocal: boolean,
    source: Track.Source,
  ): void {
    if (this.videoTracks().some((tile) => tile.track === track)) return;

    this.videoTracks.update((tiles) => [
      ...tiles,
      {
        id: this.nextVideoTileId++,
        participantIdentity,
        participantName,
        isLocal,
        source,
        track,
      },
    ]);
  }

  private removeVideoTrack(track: unknown): void {
    this.videoTracks.update((tiles) => tiles.filter((tile) => tile.track !== track));
  }
}
