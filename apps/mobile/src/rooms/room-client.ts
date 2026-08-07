import { Room } from 'livekit-client';
import type { JoinRoomResponse } from '../../../../libs/contracts/src/lib/room';

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
