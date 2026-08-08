import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import type { JoinRoomResponse, ParticipantRole } from '@live-discussions/contracts';
import {
  type Participant,
  type RemoteAudioTrack,
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

const COMMENTS_TOPIC = 'live-discussions.comments';

@Injectable()
export class RoomMediaService {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly room = new Room();
  private readonly audioElements = new Map<RemoteAudioTrack, HTMLMediaElement>();

  readonly connected = signal(false);
  readonly microphoneEnabled = signal(false);
  readonly audioPlaybackBlocked = signal(false);
  readonly participants = signal<RoomPresenceParticipant[]>([]);
  readonly comments = signal<RoomComment[]>([]);

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
    });

    this.room.on(RoomEvent.AudioPlaybackStatusChanged, () => this.syncAudioPlaybackState());
    this.room.on(RoomEvent.ParticipantConnected, () => this.syncParticipants());
    this.room.on(RoomEvent.ParticipantAttributesChanged, () => this.syncParticipants());
    this.room.on(RoomEvent.ParticipantMetadataChanged, () => this.syncParticipants());
    this.room.on(RoomEvent.ParticipantNameChanged, () => this.syncParticipants());
    this.room.on(RoomEvent.ParticipantPermissionsChanged, () => this.syncParticipants());

    this.room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) this.attachAudioTrack(track as RemoteAudioTrack);
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) this.detachAudioTrack(track as RemoteAudioTrack);
    });

    this.room.on(RoomEvent.ParticipantDisconnected, () => this.syncParticipants());
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
    this.microphoneEnabled.set(enabled);
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
    this.audioPlaybackBlocked.set(false);
    this.participants.set([]);
    this.comments.set([]);
  }
}
