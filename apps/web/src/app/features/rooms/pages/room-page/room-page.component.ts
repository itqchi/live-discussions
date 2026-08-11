import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  ROOM_REACTION_EMOJIS,
  isRoomReactionEmoji,
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
  private readonly route = inject(ActivatedRoute);
  private readonly identity = inject(DevIdentityService);
  private readonly formBuilder = inject(FormBuilder);

  readonly roomId = this.route.snapshot.paramMap.get('roomId') ?? '';
  readonly displayName = this.identity.displayName;
  readonly settingsOpen = signal(false);
  readonly replyingToId = signal<string | null>(null);
  readonly roomLinkActionStatus = signal<RoomLinkActionStatus>('idle');
  readonly availableReactions = ROOM_REACTION_EMOJIS;

  readonly joinForm = this.formBuilder.nonNullable.group({
    displayName: [this.displayName(), [Validators.required, Validators.maxLength(80)]],
  });

  readonly commentForm = this.formBuilder.nonNullable.group({
    comment: ['', [Validators.required, Validators.maxLength(1000)]],
  });

  ngOnInit(): void {
    if (this.roomId && this.displayName()) this.join();
  }

  @HostListener('document:keydown.escape')
  closeTransientUi(): void {
    this.settingsOpen.set(false);
    this.replyingToId.set(null);
    this.roomLinkActionStatus.set('idle');
  }

  openSettings(): void {
    this.roomLinkActionStatus.set('idle');
    this.settingsOpen.set(true);
  }

  join(): void {
    const requestedDisplayName = (this.displayName() || this.joinForm.controls.displayName.value).trim();
    if (!this.roomId || !requestedDisplayName || this.facade.connected() || this.facade.joining()) {
      if (!requestedDisplayName) this.joinForm.markAllAsTouched();
      return;
    }

    void this.facade.join(this.roomId, requestedDisplayName);
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

  async copyOrShareRoomLink(): Promise<void> {
    const window = this.document.defaultView;
    if (!window) {
      this.roomLinkActionStatus.set('error');
      return;
    }

    const slug = this.facade.roomSlug() || this.roomId;
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
