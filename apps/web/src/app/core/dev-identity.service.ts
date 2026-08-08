import { Injectable, inject, signal } from '@angular/core';
import { BrowserStorageService } from './browser-storage.service';

@Injectable({ providedIn: 'root' })
export class DevIdentityService {
  private readonly storage = inject(BrowserStorageService);
  private readonly userIdKey = 'live-discussions.dev-user-id';
  private readonly displayNameKey = 'live-discussions.dev-display-name';

  readonly userId = this.getOrCreateUserId();
  readonly displayName = signal(this.readPersistedValue(this.displayNameKey) ?? '');

  setDisplayName(displayName: string): void {
    const normalized = displayName.trim();
    this.displayName.set(normalized);

    if (normalized) this.storage.setLocal(this.displayNameKey, normalized);
    else this.storage.removeLocal(this.displayNameKey);
  }

  private getOrCreateUserId(): string {
    const existing = this.readPersistedValue(this.userIdKey);
    if (existing) return existing;

    const id = crypto.randomUUID();
    this.storage.setLocal(this.userIdKey, id);
    return id;
  }

  private readPersistedValue(key: string): string | null {
    const persisted = this.storage.getLocal(key);
    if (persisted) return persisted;

    const sessionValue = this.storage.getSession(key);
    if (!sessionValue) return null;

    this.storage.setLocal(key, sessionValue);
    this.storage.removeSession(key);
    return sessionValue;
  }
}
