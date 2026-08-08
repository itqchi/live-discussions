import { Injectable, inject } from '@angular/core';
import { BrowserStorageService } from './browser-storage.service';

@Injectable({ providedIn: 'root' })
export class RoomNavigationService {
  private readonly storage = inject(BrowserStorageService);
  private readonly prefix = 'live-discussions.room-origin.';

  rememberOrigin(roomSlug: string, origin: string): void {
    this.storage.setLocal(`${this.prefix}${roomSlug}`, this.normalizeOrigin(origin));
  }

  originFor(roomSlug: string): string {
    return this.normalizeOrigin(this.storage.getLocal(`${this.prefix}${roomSlug}`));
  }

  consumeOrigin(roomSlug: string): string {
    const origin = this.originFor(roomSlug);
    this.storage.removeLocal(`${this.prefix}${roomSlug}`);
    return origin;
  }

  private normalizeOrigin(origin: string | null | undefined): string {
    if (!origin || !origin.startsWith('/') || origin.startsWith('//')) return '/';
    return origin;
  }
}
