import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DevIdentityService } from '../../../../core/dev-identity.service';
import { RoomFacade } from '../../data-access/room.facade';
import { VideoTrackComponent } from '../../ui/video-track/video-track.component';

@Component({
  selector: 'live-discussions-room-page',
  standalone: true,
  imports: [RouterLink, VideoTrackComponent],
  templateUrl: './room-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomPageComponent implements OnInit {
  readonly facade = inject(RoomFacade);
  private readonly route = inject(ActivatedRoute);
  private readonly identity = inject(DevIdentityService);

  readonly roomId = this.route.snapshot.paramMap.get('roomId') ?? '';
  readonly displayName = this.identity.displayName;
  readonly initials = computed(() => this.initialsFor(this.displayName()));

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('join') === '1' && this.roomId && this.displayName()) {
      this.join();
    }
  }

  join(): void {
    if (!this.roomId || !this.displayName()) return;
    void this.facade.join(this.roomId, this.displayName());
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
