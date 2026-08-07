import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { JoinRoomRequest, JoinRoomResponse, ParticipantRole } from '@live-discussions/contracts';
import { RoomService } from './rooms/room.service';

@Component({
  selector: 'live-discussions-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="page-shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">LIVE DISCUSSIONS</p>
          <h1>Conversation first. Camera when you want it.</h1>
        </div>
        <span class="status" [class.online]="room.connected()">
          {{ room.connected() ? 'Connected' : 'Not connected' }}
        </span>
      </header>

      <section class="layout">
        <aside class="panel join-panel">
          <h2>Join a room</h2>
          <label>
            Room ID
            <input [(ngModel)]="roomId" placeholder="e.g. angular-architecture" />
          </label>
          <label>
            Display name
            <input [(ngModel)]="displayName" placeholder="Your name" />
          </label>
          <label>
            Role
            <select [(ngModel)]="role">
              <option value="listener">Listener</option>
              <option value="speaker">Speaker</option>
              <option value="moderator">Moderator</option>
              <option value="owner">Owner</option>
            </select>
          </label>

          <button class="primary" (click)="join()" [disabled]="joining() || room.connected()">
            {{ joining() ? 'Joining…' : 'Join discussion' }}
          </button>

          @if (error()) {
            <p class="error">{{ error() }}</p>
          }
        </aside>

        <section class="panel room-panel">
          <div class="room-heading">
            <div>
              <p class="eyebrow">ROOM</p>
              <h2>{{ roomId || 'Choose a room' }}</h2>
            </div>
            <span>{{ roleLabel() }}</span>
          </div>

          <div class="stage">
            <div class="avatar">{{ initials() }}</div>
            <strong>{{ displayName || 'You' }}</strong>
            <small>{{ room.connected() ? 'You are in the room' : 'Join to start listening' }}</small>
          </div>

          <div class="controls">
            <button
              (click)="toggleMicrophone()"
              [disabled]="!room.connected() || !canPublishAudio()"
            >
              {{ room.microphoneEnabled() ? 'Mute mic' : 'Enable mic' }}
            </button>
            <button
              (click)="toggleCamera()"
              [disabled]="!room.connected() || !canPublishVideo()"
            >
              {{ room.cameraEnabled() ? 'Stop camera' : 'Start camera' }}
            </button>
            <button
              (click)="toggleScreenShare()"
              [disabled]="!room.connected() || !canShareScreen()"
            >
              {{ screenSharing() ? 'Stop sharing' : 'Share screen' }}
            </button>
            <button class="danger" (click)="leave()" [disabled]="!room.connected()">Leave</button>
          </div>

          <p class="hint">
            Listener permissions are enforced by the API-issued LiveKit token, not only by these disabled buttons.
          </p>
        </section>
      </section>
    </main>
  `,
  styles: [`
    :host { display: block; }
    .page-shell { max-width: 1180px; margin: 0 auto; padding: 48px 24px; }
    .topbar { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 32px; }
    h1 { margin: 4px 0 0; max-width: 760px; font-size: clamp(2rem, 4vw, 4.6rem); line-height: .98; letter-spacing: -.05em; }
    h2 { margin: 4px 0 0; }
    .eyebrow { margin: 0; font-size: .72rem; letter-spacing: .2em; color: #94a3b8; font-weight: 700; }
    .status { padding: 8px 12px; border: 1px solid #475569; border-radius: 999px; color: #94a3b8; white-space: nowrap; }
    .status.online { color: #dcfce7; border-color: #22c55e; }
    .layout { display: grid; grid-template-columns: minmax(260px, 340px) 1fr; gap: 20px; }
    .panel { background: rgba(15, 23, 42, .78); border: 1px solid #334155; border-radius: 24px; padding: 24px; backdrop-filter: blur(14px); }
    .join-panel { display: grid; gap: 16px; align-content: start; }
    label { display: grid; gap: 7px; color: #cbd5e1; font-size: .86rem; }
    input, select { width: 100%; border: 1px solid #475569; border-radius: 12px; background: #0f172a; color: #f8fafc; padding: 12px 13px; outline: none; }
    input:focus, select:focus { border-color: #94a3b8; }
    button { border: 1px solid #475569; border-radius: 12px; background: #1e293b; color: #f8fafc; padding: 11px 14px; cursor: pointer; }
    button:disabled { opacity: .42; cursor: not-allowed; }
    .primary { background: #f8fafc; color: #0f172a; border-color: #f8fafc; font-weight: 700; }
    .danger { border-color: #7f1d1d; color: #fecaca; }
    .room-panel { min-height: 520px; display: flex; flex-direction: column; }
    .room-heading { display: flex; justify-content: space-between; gap: 20px; align-items: center; }
    .room-heading > span { color: #cbd5e1; text-transform: capitalize; }
    .stage { flex: 1; display: grid; place-items: center; align-content: center; gap: 10px; text-align: center; }
    .avatar { width: 112px; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; font-size: 2rem; font-weight: 800; background: #334155; border: 1px solid #64748b; }
    .stage small, .hint { color: #94a3b8; }
    .controls { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
    .hint { text-align: center; font-size: .8rem; margin: 18px 0 0; }
    .error { margin: 0; color: #fecaca; font-size: .86rem; }
    @media (max-width: 760px) {
      .topbar { flex-direction: column; }
      .layout { grid-template-columns: 1fr; }
      .room-panel { min-height: 460px; }
    }
  `],
})
export class AppComponent {
  readonly room = inject(RoomService);

  roomId = 'general';
  displayName = '';
  role: ParticipantRole = 'listener';

  readonly joining = signal(false);
  readonly error = signal<string | null>(null);
  readonly screenSharing = signal(false);
  readonly participant = signal<JoinRoomResponse['participant'] | null>(null);

  readonly canPublishAudio = computed(() => this.participant()?.permissions.canPublishAudio ?? false);
  readonly canPublishVideo = computed(() => this.participant()?.permissions.canPublishVideo ?? false);
  readonly canShareScreen = computed(() => this.participant()?.permissions.canShareScreen ?? false);
  readonly roleLabel = computed(() => this.participant()?.role ?? this.role);
  readonly initials = computed(() => {
    const value = this.displayName.trim();
    return value ? value.split(/\s+/).slice(0, 2).map((part) => part[0].toUpperCase()).join('') : '?';
  });

  async join(): Promise<void> {
    if (!this.roomId.trim() || !this.displayName.trim()) {
      this.error.set('Room ID and display name are required.');
      return;
    }

    this.joining.set(true);
    this.error.set(null);

    const request: JoinRoomRequest = {
      roomId: this.roomId.trim(),
      userId: crypto.randomUUID(),
      displayName: this.displayName.trim(),
      role: this.role,
    };

    try {
      const response = await fetch('http://localhost:3000/rooms/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Join failed (${response.status})`);
      }

      const session = (await response.json()) as JoinRoomResponse;
      await this.room.connect(session);
      this.participant.set(session.participant);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to join the room.');
    } finally {
      this.joining.set(false);
    }
  }

  async toggleMicrophone(): Promise<void> {
    await this.room.setMicrophone(!this.room.microphoneEnabled());
  }

  async toggleCamera(): Promise<void> {
    await this.room.setCamera(!this.room.cameraEnabled());
  }

  async toggleScreenShare(): Promise<void> {
    const next = !this.screenSharing();
    await this.room.setScreenShare(next);
    this.screenSharing.set(next);
  }

  leave(): void {
    this.room.disconnect();
    this.participant.set(null);
    this.screenSharing.set(false);
  }
}
