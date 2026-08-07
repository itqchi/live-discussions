import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  input,
} from '@angular/core';
import type { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client';

@Component({
  selector: 'live-discussions-video-track',
  standalone: true,
  templateUrl: './video-track.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoTrackComponent implements AfterViewInit, OnDestroy {
  readonly track = input.required<LocalVideoTrack | RemoteVideoTrack>();

  @ViewChild('video', { static: true })
  private readonly video!: ElementRef<HTMLVideoElement>;

  ngAfterViewInit(): void {
    this.track().attach(this.video.nativeElement);
  }

  ngOnDestroy(): void {
    this.track().detach(this.video.nativeElement);
  }
}
