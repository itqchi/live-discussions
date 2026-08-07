import type { JoinRoomResponse } from '@live-discussions/contracts';
import { Room } from 'livekit-client';

export class MobileRoomClient {
  private readonly room = new Room();

  async connect(session: JoinRoomResponse): Promise<void> {
    await this.room.connect(session.livekitUrl, session.token);
  }

  setMicrophone(enabled: boolean): Promise<void> {
    return this.room.localParticipant.setMicrophoneEnabled(enabled).then(() => undefined);
  }

  setCamera(enabled: boolean): Promise<void> {
    return this.room.localParticipant.setCameraEnabled(enabled).then(() => undefined);
  }

  disconnect(): void {
    this.room.disconnect();
  }
}
