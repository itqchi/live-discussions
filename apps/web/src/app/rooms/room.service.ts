import { Injectable, signal } from '@angular/core';
import { Room, RoomEvent } from 'livekit-client';
import type { JoinRoomResponse } from '../../../../../libs/contracts/src/lib/room';

@Injectable({ providedIn: 'root' })
export class RoomService {
  private readonly room = new Room();

  readonly connected = signal(false);
  readonly microphoneEnabled = signal(false);
  readonly cameraEnabled = signal(false);

  constructor() {
    this.room.on(RoomEvent.Connected, () => this.connected.set(true));
    this.room.on(RoomEvent.Disconnected, () => this.connected.set(false));
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
}
