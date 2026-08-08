import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import type { JoinRoomResponse, ParticipantRole } from '@live-discussions/contracts';
import {
  type LocalVideoTrack,
  type Participant,
  type RemoteAudioTrack,
  type RemoteVideoTrack,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client';

export interface RoomPresenceParticipant {
  identity: string;
  name: string;
  role: ParticipantRole;
  raisedHand: boolean;
  isLocal: boolean;
}

export interface RoomComment {
  id: string;
  participantIdentity: string;
  participantName: string;
  text: string;
  timestamp: number;
  isLocal: boolean;
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

@Injectable()
export class RoomMediaService {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly room = new Room();
  private readonly audioElements = new Map<RemoteAudioTrack, HTMLMediaElement>();
  private nextVideoTileId = 1;

  readonly connected = signal(false);
  readonly microphoneEnabled = signal(false);
  readonly cameraEnabled = signal(false);
  readonly screenSharing = signal(false);
  readonly audioPlaybackBlocked = signal(false);
  readonly participants = signal<RoomPresenceParticipant[]>([]);
  readonly comments = signal<RoomComment[]>([]);
  readonly videoTracks = signal<VideoTile[]>([]);
  readonly featuredParticipantId = signal<string | null>(null);

  constructor() {
    this.room.registerTextStreamHandler(COMMENTS_TOPIC, async (reader, participantInfo) => {
      const text = (await reader.readAll()).trim();
      if (!text) return;

      this.comments.update((comments) => [
        ...comments,
        {
          id: reader.info.id,
          participantIdentity: participantInfo.identity,
          participantName: this.participantName(participantInfo.identity),
          text,
          timestamp: reader.info.timestamp,
          isLocal: false,
        },
      ]);
    });

    this.room.on(RoomEvent.Connected, () => {
      this.connected.set(true);
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

    this.room.on(RoomEvent.Disconnected, () => this.resetMediaState());

    this.destroyRef.onDestroy(() => {
      this.cleanupAudioTracks();
      this.room.unregisterTextStreamHandler(COMMENTS_TOPIC);
      this.room.removeAllListeners();
      this.room.disconnect();
    });
  }

  connect(session: JoinRoomResponse): Promise<void> {
    return this.room.connect(session.livekitUrl, session.token);
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
    const publication = await this.room.localParticipant.setScreenShareEnabled(enabled);

    if (enabled && !publication) {
      throw new Error('Screen sharing was not started. Your browser may have cancelled or blocked the share request.');
    }

    this.syncLocalMediaState();
  }

  async sendComment(text: string): Promise<void> {
    const normalizedText = text.trim();
    if (!normalizedText || !this.connected()) return;

    const info = await this.room.localParticipant.sendText(normalizedText, {
      topic: COMMENTS_TOPIC,
    });

    this.comments.update((comments) => [
      ...comments,
      {
        id: info.id,
        participantIdentity: this.room.localParticipant.identity,
        participantName: this.room.localParticipant.name || this.room.localParticipant.identity,
        text: normalizedText,
        timestamp: Date.now(),
        isLocal: true,
      },
    ]);
  }

  async resumeAudio(): Promise<void> {
    await this.room.startAudio();
    this.syncAudioPlaybackState();
  }

  disconnect(): void {
    this.room.disconnect();
  }

  private syncLocalMediaState(): void {
    const publications = [...this.room.localParticipant.trackPublications.values()];
    this.microphoneEnabled.set(
      publications.some((publication) => publication.source === Track.Source.Microphone && !publication.isMuted),
    );
    this.cameraEnabled.set(
      publications.some((publication) => publication.source === Track.Source.Camera && !publication.isMuted),
    );
    this.screenSharing.set(
      publications.some((publication) => publication.source === Track.Source.ScreenShare && !publication.isMuted),
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
        typeof featuredParticipantId === 'string' && featuredParticipantId ? featuredParticipantId : null,
      );
    } catch {
      this.featuredParticipantId.set(null);
    }
  }

  private participantName(identity: string): string {
    if (identity === this.room.localParticipant.identity) {
      return this.room.localParticipant.name || identity;
    }

    const participant = this.room.remoteParticipants.get(identity);
    return participant?.name || identity;
  }

  private toPresenceParticipant(participant: Participant, isLocal: boolean): RoomPresenceParticipant {
    return {
      identity: participant.identity,
      name: participant.name || participant.identity,
      role: this.roleFromMetadata(participant.metadata),
      raisedHand: participant.attributes['raisedHand'] === 'true',
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
      // Treat malformed application metadata as the least-privileged display role.
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
    element.remove();
    this.audioElements.delete(track);
  }

  private cleanupAudioTracks(): void {
    for (const [track, element] of this.audioElements) {
      track.detach(element);
      element.remove();
    }

    this.audioElements.clear();
  }

  private resetMediaState(): void {
    this.cleanupAudioTracks();
    this.connected.set(false);
    this.microphoneEnabled.set(false);
    this.cameraEnabled.set(false);
    this.screenSharing.set(false);
    this.audioPlaybackBlocked.set(false);
    this.participants.set([]);
    this.comments.set([]);
    this.videoTracks.set([]);
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
