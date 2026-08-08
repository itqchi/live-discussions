import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DevIdentityService {
  private readonly userIdKey = 'live-discussions.dev-user-id';
  private readonly displayNameKey = 'live-discussions.dev-display-name';

  readonly userId = this.getOrCreateUserId();
  readonly displayName = signal(sessionStorage.getItem(this.displayNameKey) ?? '');

  setDisplayName(displayName: string): void {
    const normalized = displayName.trim();
    this.displayName.set(normalized);

    if (normalized) sessionStorage.setItem(this.displayNameKey, normalized);
    else sessionStorage.removeItem(this.displayNameKey);
  }

  private getOrCreateUserId(): string {
    const existing = sessionStorage.getItem(this.userIdKey);
    if (existing) return existing;

    const id = crypto.randomUUID();
    sessionStorage.setItem(this.userIdKey, id);
    return id;
  }
}
