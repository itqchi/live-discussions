import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  Input,
} from '@angular/core';
import type { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client';

type VideoTrack = LocalVideoTrack | RemoteVideoTrack;

@Component({
  selector: 'live-discussions-video-track',
  standalone: true,
  templateUrl: './video-track.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoTrackComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) track!: VideoTrack;

  @ViewChild('video', { static: true })
  private readonly video!: ElementRef<HTMLVideoElement>;

  private attachedTrack: VideoTrack | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['track'] || !this.video) return;
    this.attachCurrentTrack();
  }

  ngAfterViewInit(): void {
    this.attachCurrentTrack();
  }

  ngOnDestroy(): void {
    this.detachCurrentTrack();
  }

  private attachCurrentTrack(): void {
    if (!this.track || !this.video || this.attachedTrack === this.track) return;
    this.detachCurrentTrack();
    this.track.attach(this.video.nativeElement);
    this.attachedTrack = this.track;
  }

  private detachCurrentTrack(): void {
    if (!this.attachedTrack || !this.video) return;
    this.attachedTrack.detach(this.video.nativeElement);
    this.attachedTrack = null;
  }
}
