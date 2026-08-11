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
import { ROOM_REACTION_EMOJIS } from '@live-discussions/contracts';
import { DevIdentityService } from '../../../../core/dev-identity.service';
import { DismissibleDetailsDirective } from '../../../../shared/ui/dismissible-details.directive';
import { RoomFacade } from '../../data-access/room.facade';
import type { RoomComment } from '../../data-access/room-media.service';
import { VideoTrackComponent } from '../../ui/video-track/video-track.component';

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
  private readonly route = inject(ActivatedRoute);
  private readonly identity = inject(DevIdentityService);
  private readonly formBuilder = inject(FormBuilder);

  readonly roomId = this.route.snapshot.paramMap.get('roomId') ?? '';
  readonly roomPath = `/room/${this.roomId}`;
  readonly displayName = this.identity.displayName;
  readonly settingsOpen = signal(false);
  readonly replyingToId = signal<string | null>(null);
  readonly availableReactions = ROOM_REACTION_EMOJIS;

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
  }

  openSettings(): void {
    this.settingsOpen.set(true);
  }

  join(): void {
    if (!this.roomId || !this.displayName() || this.facade.connected() || this.facade.joining()) return;
    void this.facade.join(this.roomId, this.displayName());
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

  reactionEntries(comment: RoomComment): { emoji: string; count: number }[] {
    return Object.entries(comment.reactions ?? {})
      .filter(([, identities]) => identities.length > 0)
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
