import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class RoomNavigationService {
  private readonly prefix = 'live-discussions.room-origin.';

  rememberOrigin(roomSlug: string, origin: string): void {
    localStorage.setItem(`${this.prefix}${roomSlug}`, origin || '/');
  }

  originFor(roomSlug: string): string {
    return localStorage.getItem(`${this.prefix}${roomSlug}`) || '/';
  }

  consumeOrigin(roomSlug: string): string {
    const origin = this.originFor(roomSlug);
    localStorage.removeItem(`${this.prefix}${roomSlug}`);
    return origin;
  }
}
