import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, input } from '@angular/core';
import type { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client';

@Component({
  selector: 'live-discussions-video-track',
  standalone: true,
  template: '<video #video autoplay playsinline></video>',
  styles: [`
    :host { display: block; width: 100%; height: 100%; }
    video { width: 100%; height: 100%; object-fit: cover; background: #111827; border-radius: 18px; }
  `],
})
export class VideoTrackComponent implements AfterViewInit, OnDestroy {
  readonly track = input.required<LocalVideoTrack | RemoteVideoTrack>();

  @ViewChild('video', { static: true })
  private video!: ElementRef<HTMLVideoElement>;

  ngAfterViewInit(): void {
    this.track().attach(this.video.nativeElement);
  }

  ngOnDestroy(): void {
    this.track().detach(this.video.nativeElement);
  }
}
