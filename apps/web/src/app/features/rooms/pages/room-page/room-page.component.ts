import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
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
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly identity = inject(DevIdentityService);

  readonly roomId = this.route.snapshot.paramMap.get('roomId') ?? '';

  readonly joinForm = this.formBuilder.nonNullable.group({
    displayName: [this.identity.displayName(), [Validators.required, Validators.maxLength(80)]],
  });

  readonly displayName = toSignal(this.joinForm.controls.displayName.valueChanges, {
    initialValue: this.joinForm.controls.displayName.value,
  });

  readonly initials = computed(() => {
    const value = this.displayName().trim();
    if (!value) return '?';

    return value
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  });

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('join') === '1' && this.joinForm.valid) {
      this.join();
    }
  }

  join(): void {
    if (this.joinForm.invalid || !this.roomId) {
      this.joinForm.markAllAsTouched();
      return;
    }

    const displayName = this.joinForm.controls.displayName.value;
    void this.facade.join(this.roomId, displayName);
  }
}
