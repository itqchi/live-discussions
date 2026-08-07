import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RoomFacade } from '../../data-access/room.facade';
import { VideoTrackComponent } from '../../ui/video-track/video-track.component';

@Component({
  selector: 'live-discussions-room-page',
  standalone: true,
  imports: [ReactiveFormsModule, VideoTrackComponent],
  templateUrl: './room-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomPageComponent {
  readonly facade = inject(RoomFacade);
  private readonly formBuilder = inject(FormBuilder);

  readonly joinForm = this.formBuilder.nonNullable.group({
    roomId: ['general', [Validators.required]],
    displayName: ['', [Validators.required, Validators.maxLength(80)]],
  });

  join(): void {
    if (this.joinForm.invalid) {
      this.joinForm.markAllAsTouched();
      return;
    }

    const { roomId, displayName } = this.joinForm.getRawValue();
    void this.facade.join(roomId, displayName);
  }

  initials(): string {
    const displayName = this.joinForm.controls.displayName.value.trim();
    if (!displayName) return '?';

    return displayName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }
}
