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

export interface VideoTile {
  id: number;
  participantIdentity: string;
  participantName: string;
  isLocal: boolean;
  track: LocalVideoTrack | RemoteVideoTrack;
}

export interface RoomPresenceParticipant {
  identity: string;
  name: string;
  role: ParticipantRole;
  raisedHand: boolean;
  isLocal: boolean;
}

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
  readonly videoTracks = signal<VideoTile[]>([]);
  readonly participants = signal<RoomPresenceParticipant[]>([]);

  constructor() {
    this.room.on(RoomEvent.Connected, () => {
      this.connected.set(true);
      this.syncAudioPlaybackState();
      this.syncParticipants();
    });

    this.room.on(RoomEvent.AudioPlaybackStatusChanged, () => this.syncAudioPlaybackState());
    this.room.on(RoomEvent.ParticipantConnected, () => this.syncParticipants());
    this.room.on(RoomEvent.ParticipantAttributesChanged, () => this.syncParticipants());
    this.room.on(RoomEvent.ParticipantMetadataChanged, () => this.syncParticipants());
    this.room.on(RoomEvent.ParticipantNameChanged, () => this.syncParticipants());
    this.room.on(RoomEvent.ParticipantPermissionsChanged, () => this.syncParticipants());

    this.room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
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
      if (!track || track.kind !== Track.Kind.Video) return;
      this.addVideoTrack(
        track as LocalVideoTrack,
        participant.identity,
        participant.name || participant.identity,
        true,
      );
    });

    this.room.on(RoomEvent.LocalTrackUnpublished, (publication) => {
      if (publication.source === Track.Source.ScreenShare) this.screenSharing.set(false);
      if (publication.track) this.removeVideoTrack(publication.track);
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
      this.room.removeAllListeners();
      this.room.disconnect();
    });
  }

  connect(session: JoinRoomResponse): Promise<void> {
    return this.room.connect(session.livekitUrl, session.token);
  }

  async setMicrophone(enabled: boolean): Promise<void> {
    await this.room.localParticipant.setMicrophoneEnabled(enabled);
    this.microphoneEnabled.set(enabled);
  }

  async setCamera(enabled: boolean): Promise<void> {
    await this.room.localParticipant.setCameraEnabled(enabled);
    this.cameraEnabled.set(enabled);
  }

  async setScreenShare(enabled: boolean): Promise<void> {
    await this.room.localParticipant.setScreenShareEnabled(enabled);
    this.screenSharing.set(enabled);
  }

  async resumeAudio(): Promise<void> {
    await this.room.startAudio();
    this.syncAudioPlaybackState();
  }

  disconnect(): void {
    this.room.disconnect();
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
    this.videoTracks.set([]);
    this.participants.set([]);
  }

  private addVideoTrack(
    track: LocalVideoTrack | RemoteVideoTrack,
    participantIdentity: string,
    participantName: string,
    isLocal: boolean,
  ): void {
    if (this.videoTracks().some((tile) => tile.track === track)) return;

    this.videoTracks.update((tiles) => [
      ...tiles,
      { id: this.nextVideoTileId++, participantIdentity, participantName, isLocal, track },
    ]);
  }

  private removeVideoTrack(track: unknown): void {
    this.videoTracks.update((tiles) => tiles.filter((tile) => tile.track !== track));
  }
}
