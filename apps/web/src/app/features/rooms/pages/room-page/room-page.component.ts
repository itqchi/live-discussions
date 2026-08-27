import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  ROOM_REACTION_EMOJIS,
  isRoomReactionEmoji,
  type ParticipantRole,
  type RoomReactionEmoji,
} from '@live-discussions/contracts';
import { DevIdentityService } from '../../../../core/dev-identity.service';
import { DismissibleDetailsDirective } from '../../../../shared/ui/dismissible-details.directive';
import { RoomFacade } from '../../data-access/room.facade';
import type { RoomComment } from '../../data-access/room-media.service';
import { VideoTrackComponent } from '../../ui/video-track/video-track.component';

type RoomLinkActionStatus = 'idle' | 'copied' | 'shared' | 'error';

@Component({
  selector: 'live-discussions-room-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, VideoTrackComponent, DismissibleDetailsDirective],
  templateUrl: './room-page.component.html',
  styleUrl: './room-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomPageComponent implements OnInit {
  readonly facade = inject(RoomFacade);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly identity = inject(DevIdentityService);
  private readonly formBuilder = inject(FormBuilder);

  readonly roomId = signal(this.route.snapshot.paramMap.get('roomId') ?? '');
  readonly displayName = this.identity.displayName;
  readonly settingsOpen = signal(false);
  readonly settingsSaved = signal(false);
  readonly replyingToId = signal<string | null>(null);
  readonly roomLinkActionStatus = signal<RoomLinkActionStatus>('idle');
  readonly now = signal(Date.now());
  readonly availableReactions = ROOM_REACTION_EMOJIS;
  readonly muteDurations = [
    { label: '15 sec', seconds: 15 },
    { label: '30 sec', seconds: 30 },
    { label: '1 min', seconds: 60 },
    { label: '5 min', seconds: 300 },
  ] as const;
  readonly raisedHands = computed(() =>
    this.facade.audienceParticipants().filter((participant) => participant.raisedHand),
  );
  readonly audienceWithoutRaisedHands = computed(() =>
    this.facade.audienceParticipants().filter((participant) => !participant.raisedHand),
  );

  readonly joinForm = this.formBuilder.nonNullable.group({
    displayName: [this.displayName(), [Validators.required, Validators.maxLength(80)]],
  });

  readonly commentForm = this.formBuilder.nonNullable.group({
    comment: ['', [Validators.required, Validators.maxLength(1000)]],
  });

  readonly settingsForm = this.formBuilder.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', [Validators.maxLength(500)]],
    isLocked: [false],
  });

  ngOnInit(): void {
    const clock = setInterval(() => this.now.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => clearInterval(clock));

    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const nextRoomId = params.get('roomId') ?? '';
        if (nextRoomId === this.roomId()) return;

        this.roomId.set(nextRoomId);
        this.closeTransientUi();
        this.commentForm.reset();
        void this.facade.switchRoom(nextRoomId, this.displayName());
      });

    if (!this.roomId()) return;
    if (this.displayName()) this.join();
    else void this.facade.loadRoomDetails(this.roomId());
  }

  @HostListener('document:keydown.escape')
  closeTransientUi(): void {
    this.settingsOpen.set(false);
    this.settingsSaved.set(false);
    this.replyingToId.set(null);
    this.roomLinkActionStatus.set('idle');
  }

  openSettings(): void {
    this.roomLinkActionStatus.set('idle');
    this.settingsSaved.set(false);
    this.settingsForm.reset({
      title: this.facade.roomTitle() || this.roomId(),
      description: this.facade.roomDescription(),
      isLocked: this.facade.roomLocked(),
    });
    this.settingsOpen.set(true);
    if (this.facade.canModerate()) void this.facade.loadBannedUsers();
  }

  saveSettings(): void {
    if (this.settingsForm.invalid || !this.facade.canEditRoomSettings()) {
      this.settingsForm.markAllAsTouched();
      return;
    }

    this.settingsSaved.set(false);
    const value = this.settingsForm.getRawValue();
    void this.facade.updateRoomSettings({
      title: value.title.trim(),
      description: value.description.trim(),
      isLocked: value.isLocked,
    }).then((saved) => this.settingsSaved.set(saved));
  }

  join(): void {
    const requestedDisplayName = (this.displayName() || this.joinForm.controls.displayName.value).trim();
    const roomId = this.roomId();
    if (!roomId || !requestedDisplayName || this.facade.connected() || this.facade.joining()) {
      if (!requestedDisplayName) this.joinForm.markAllAsTouched();
      return;
    }

    void this.facade.join(roomId, requestedDisplayName);
  }

  sendComment(): void {
    if (this.commentForm.invalid || !this.facade.connected()) {
      this.commentForm.markAllAsTouched();
      return;
    }

    const text = this.commentForm.controls.comment.value;
    void this.facade.sendComment(text, this.replyingToId()).then((sent) => {
      if (sent) {
        this.commentForm.reset();
        this.replyingToId.set(null);
      }
    });
  }

  replyTo(commentId: string): void {
    this.replyingToId.set(commentId);
  }

  cancelReply(): void {
    this.replyingToId.set(null);
  }

  closeRoom(): void {
    void this.facade.closeRoom().then((closed) => {
      if (closed) this.settingsOpen.set(false);
    });
  }

  canMuteParticipant(role: ParticipantRole, isLocal: boolean): boolean {
    if (!this.facade.canModerate() || isLocal || role === 'owner') return false;
    return role !== 'moderator' || this.facade.currentRole() === 'owner';
  }

  muteRemainingLabel(mutedUntil: number | null): string {
    if (!mutedUntil) return '';
    const seconds = Math.max(0, Math.ceil((mutedUntil - this.now()) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainder = String(seconds % 60).padStart(2, '0');
    return `${minutes}:${remainder}`;
  }

  async copyOrShareRoomLink(): Promise<void> {
    const window = this.document.defaultView;
    if (!window) {
      this.roomLinkActionStatus.set('error');
      return;
    }

    const slug = this.facade.roomSlug() || this.roomId();
    const url = new URL(`/room/${encodeURIComponent(slug)}`, window.location.origin).toString();
    const title = this.facade.roomTitle() || slug;

    try {
      if (window.navigator.clipboard?.writeText) {
        await window.navigator.clipboard.writeText(url);
        this.roomLinkActionStatus.set('copied');
        return;
      }

      if (window.navigator.share) {
        await window.navigator.share({ title, url });
        this.roomLinkActionStatus.set('shared');
        return;
      }

      this.roomLinkActionStatus.set('error');
    } catch {
      this.roomLinkActionStatus.set('error');
    }
  }

  reactionEntries(comment: RoomComment): { emoji: RoomReactionEmoji; count: number }[] {
    return Object.entries(comment.reactions ?? {})
      .filter((entry): entry is [RoomReactionEmoji, string[]] =>
        isRoomReactionEmoji(entry[0]) && entry[1].length > 0,
      )
      .map(([emoji, identities]) => ({ emoji, count: identities.length }));
  }

  initialsFor(name: string): string {
    const value = name.trim();
    if (!value) return '?';

    return value
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }
}
