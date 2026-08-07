import { Injectable, signal } from '@angular/core';
import type { JoinRoomResponse } from '@live-discussions/contracts';
import {
  type LocalVideoTrack,
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

@Injectable({ providedIn: 'root' })
export class RoomService {
  private readonly room = new Room();
  private nextVideoTileId = 1;

  readonly connected = signal(false);
  readonly microphoneEnabled = signal(false);
  readonly cameraEnabled = signal(false);
  readonly videoTracks = signal<VideoTile[]>([]);

  constructor() {
    this.room.on(RoomEvent.Connected, () => this.connected.set(true));

    this.room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
      if (track.kind !== Track.Kind.Video) return;

      this.addVideoTrack(
        track as RemoteVideoTrack,
        participant.identity,
        participant.name || participant.identity,
        false,
      );
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (track) => this.removeVideoTrack(track));

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
      if (publication.track) this.removeVideoTrack(publication.track);
    });

    this.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      this.videoTracks.update((tiles) =>
        tiles.filter((tile) => tile.participantIdentity !== participant.identity),
      );
    });

    this.room.on(RoomEvent.Disconnected, () => {
      this.connected.set(false);
      this.microphoneEnabled.set(false);
      this.cameraEnabled.set(false);
      this.videoTracks.set([]);
    });
  }

  async connect(session: JoinRoomResponse): Promise<void> {
    await this.room.connect(session.livekitUrl, session.token);
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
  }

  disconnect(): void {
    this.room.disconnect();
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
      {
        id: this.nextVideoTileId++,
        participantIdentity,
        participantName,
        isLocal,
        track,
      },
    ]);
  }

  private removeVideoTrack(track: unknown): void {
    this.videoTracks.update((tiles) => tiles.filter((tile) => tile.track !== track));
  }
}
