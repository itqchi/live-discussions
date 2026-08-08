import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DevIdentityService } from '../../../../core/dev-identity.service';
import { RoomFacade } from '../../data-access/room.facade';
import { VideoTrackComponent } from '../../ui/video-track/video-track.component';

@Component({
  selector: 'live-discussions-room-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, VideoTrackComponent],
  templateUrl: './room-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomPageComponent implements OnInit {
  readonly facade = inject(RoomFacade);
  private readonly route = inject(ActivatedRoute);
  private readonly identity = inject(DevIdentityService);
  private readonly formBuilder = inject(FormBuilder);

  readonly roomId = this.route.snapshot.paramMap.get('roomId') ?? '';
  readonly displayName = this.identity.displayName;
  readonly initials = computed(() => this.initialsFor(this.displayName()));

  readonly commentForm = this.formBuilder.nonNullable.group({
    comment: ['', [Validators.required, Validators.maxLength(1000)]],
  });

  ngOnInit(): void {
    if (this.roomId && this.displayName()) this.join();
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
    void this.facade.sendComment(text).then((sent) => {
      if (sent) this.commentForm.reset();
    });
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
