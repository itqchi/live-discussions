import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RoomFacade } from './rooms/room.facade';
import { VideoTrackComponent } from './rooms/video-track.component';

@Component({
  selector: 'live-discussions-root',
  standalone: true,
  imports: [FormsModule, VideoTrackComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page-shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">LIVE DISCUSSIONS</p>
          <h1>Conversation first. Camera when you want it.</h1>
        </div>
        <span class="status" [class.online]="facade.media.connected()">
          {{ facade.media.connected() ? 'Connected' : 'Not connected' }}
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
          <p class="assignment-note">Your room role is assigned by the server.</p>

          <button class="primary" (click)="join()" [disabled]="facade.joining() || facade.media.connected()">
            {{ facade.joining() ? 'Joining…' : 'Join discussion' }}
          </button>

          @if (facade.error()) {
            <p class="error">{{ facade.error() }}</p>
          }
        </aside>

        <section class="panel room-panel">
          <div class="room-heading">
            <div>
              <p class="eyebrow">ROOM</p>
              <h2>{{ roomId || 'Choose a room' }}</h2>
            </div>
            <span>{{ facade.roleLabel() }}</span>
          </div>

          @if (facade.media.videoTracks().length) {
            <div class="video-grid">
              @for (tile of facade.media.videoTracks(); track tile.id) {
                <article class="video-tile">
                  <live-discussions-video-track [track]="tile.track" />
                  <div class="video-label">
                    <strong>{{ tile.participantName }}</strong>
                    @if (tile.isLocal) {
                      <span>You</span>
                    }
                  </div>
                </article>
              }
            </div>
          } @else {
            <div class="stage">
              <div class="avatar">{{ initials() }}</div>
              <strong>{{ displayName || 'You' }}</strong>
              <small>{{ facade.media.connected() ? 'You are in the room' : 'Join to start listening' }}</small>
            </div>
          }

          <div class="controls">
            <button (click)="facade.toggleMicrophone()" [disabled]="!facade.media.connected() || !facade.canPublishAudio()">
              {{ facade.media.microphoneEnabled() ? 'Mute mic' : 'Enable mic' }}
            </button>
            <button (click)="facade.toggleCamera()" [disabled]="!facade.media.connected() || !facade.canPublishVideo()">
              {{ facade.media.cameraEnabled() ? 'Stop camera' : 'Start camera' }}
            </button>
            <button (click)="facade.toggleScreenShare()" [disabled]="!facade.media.connected() || !facade.canShareScreen()">
              {{ facade.screenSharing() ? 'Stop sharing' : 'Share screen' }}
            </button>
            <button class="danger" (click)="facade.leave()" [disabled]="!facade.media.connected()">Leave</button>
          </div>

          <p class="hint">
            Publishing capabilities come from the server-issued LiveKit token. The development identity adapter will be replaced by real authentication.
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
    input { width: 100%; border: 1px solid #475569; border-radius: 12px; background: #0f172a; color: #f8fafc; padding: 12px 13px; outline: none; }
    input:focus { border-color: #94a3b8; }
    button { border: 1px solid #475569; border-radius: 12px; background: #1e293b; color: #f8fafc; padding: 11px 14px; cursor: pointer; }
    button:disabled { opacity: .42; cursor: not-allowed; }
    .primary { background: #f8fafc; color: #0f172a; border-color: #f8fafc; font-weight: 700; }
    .danger { border-color: #7f1d1d; color: #fecaca; }
    .assignment-note { margin: -4px 0 0; color: #94a3b8; font-size: .8rem; }
    .room-panel { min-height: 520px; display: flex; flex-direction: column; gap: 20px; }
    .room-heading { display: flex; justify-content: space-between; gap: 20px; align-items: center; }
    .room-heading > span { color: #cbd5e1; text-transform: capitalize; }
    .stage { flex: 1; display: grid; place-items: center; align-content: center; gap: 10px; text-align: center; min-height: 300px; }
    .avatar { width: 112px; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; font-size: 2rem; font-weight: 800; background: #334155; border: 1px solid #64748b; }
    .stage small, .hint { color: #94a3b8; }
    .video-grid { flex: 1; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; align-content: start; }
    .video-tile { position: relative; aspect-ratio: 16 / 10; min-height: 180px; border-radius: 18px; overflow: hidden; background: #111827; }
    .video-label { position: absolute; left: 12px; bottom: 12px; display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 999px; background: rgba(2, 6, 23, .72); backdrop-filter: blur(8px); font-size: .8rem; }
    .video-label span { color: #94a3b8; }
    .controls { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
    .hint { text-align: center; font-size: .8rem; margin: 0; }
    .error { margin: 0; color: #fecaca; font-size: .86rem; }
    @media (max-width: 760px) {
      .topbar { flex-direction: column; }
      .layout { grid-template-columns: 1fr; }
      .room-panel { min-height: 460px; }
    }
  `],
})
export class AppComponent {
  readonly facade = inject(RoomFacade);

  roomId = 'general';
  displayName = '';

  readonly initials = computed(() => {
    const value = this.displayName.trim();
    return value ? value.split(/\s+/).slice(0, 2).map((part) => part[0].toUpperCase()).join('') : '?';
  });

  join(): Promise<void> {
    return this.facade.join(this.roomId, this.displayName);
  }
}
