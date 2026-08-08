import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DevIdentityService {
  private readonly userIdKey = 'live-discussions.dev-user-id';
  private readonly displayNameKey = 'live-discussions.dev-display-name';

  readonly userId = this.getOrCreateUserId();
  readonly displayName = signal(this.readPersistedValue(this.displayNameKey) ?? '');

  setDisplayName(displayName: string): void {
    const normalized = displayName.trim();
    this.displayName.set(normalized);

    if (normalized) localStorage.setItem(this.displayNameKey, normalized);
    else localStorage.removeItem(this.displayNameKey);
  }

  private getOrCreateUserId(): string {
    const existing = this.readPersistedValue(this.userIdKey);
    if (existing) return existing;

    const id = crypto.randomUUID();
    localStorage.setItem(this.userIdKey, id);
    return id;
  }

  private readPersistedValue(key: string): string | null {
    const persisted = localStorage.getItem(key);
    if (persisted) return persisted;

    const sessionValue = sessionStorage.getItem(key);
    if (!sessionValue) return null;

    localStorage.setItem(key, sessionValue);
    sessionStorage.removeItem(key);
    return sessionValue;
  }
}
