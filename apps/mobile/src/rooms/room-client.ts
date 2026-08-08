import type { JoinRoomResponse } from '@live-discussions/contracts';
import { Room } from 'livekit-client';

export class MobileRoomClient {
  private readonly room = new Room();

  async connect(session: JoinRoomResponse): Promise<void> {
    await this.room.connect(session.livekitUrl, session.token);
  }

  async setMicrophone(enabled: boolean): Promise<void> {
    await this.room.localParticipant.setMicrophoneEnabled(enabled);
  }

  async setCamera(enabled: boolean): Promise<void> {
    await this.room.localParticipant.setCameraEnabled(enabled);
  }

  async disconnect(): Promise<void> {
    await this.room.disconnect(true);
  }
}
