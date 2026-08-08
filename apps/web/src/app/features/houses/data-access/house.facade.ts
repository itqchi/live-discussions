import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { GetHouseResponse, HouseDetail, HouseMemberRole } from '@live-discussions/contracts';
import { DevIdentityService } from '../../../core/dev-identity.service';
import { HouseApiService } from './house-api.service';

@Injectable()
export class HouseFacade {
  private readonly router = inject(Router);
  private readonly identity = inject(DevIdentityService);
  private readonly api = inject(HouseApiService);

  readonly displayName = this.identity.displayName;
  readonly house = signal<HouseDetail | null>(null);
  readonly role = signal<HouseMemberRole | null>(null);
  readonly loading = signal(false);
  readonly joining = signal(false);
  readonly creatingRoom = signal(false);
  readonly error = signal<string | null>(null);

  async load(houseId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const response = await this.api.getHouse(houseId, this.identity.userId, this.displayName());
      this.applyResponse(response);
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to load the House.'));
    } finally {
      this.loading.set(false);
    }
  }

  setDisplayName(displayName: string): void {
    this.identity.setDisplayName(displayName);
  }

  async join(): Promise<void> {
    const house = this.house();
    if (!house || !this.requireDisplayName()) return;

    this.joining.set(true);
    this.error.set(null);

    try {
      const response = await this.api.joinHouse(
        { houseId: house.id },
        this.identity.userId,
        this.displayName(),
      );
      this.house.update((current) => current ? { ...current, memberCount: response.house.memberCount } : current);
      this.role.set(response.role);
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to join the House.'));
    } finally {
      this.joining.set(false);
    }
  }

  async createRoom(title: string): Promise<void> {
    const house = this.house();
    const normalizedTitle = title.trim();
    if (!house || !normalizedTitle || !this.requireDisplayName()) {
      if (!normalizedTitle) this.error.set('Enter a room title.');
      return;
    }

    this.creatingRoom.set(true);
    this.error.set(null);

    try {
      const roomId = this.roomIdFromTitle(normalizedTitle);
      await this.api.createRoom(
        house.id,
        { roomId, title: normalizedTitle },
        this.identity.userId,
        this.displayName(),
      );
      await this.router.navigate(['/rooms', roomId], { queryParams: { join: '1' } });
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to create a room in this House.'));
    } finally {
      this.creatingRoom.set(false);
    }
  }

  joinRoom(roomId: string): Promise<boolean> {
    if (!this.requireDisplayName()) return Promise.resolve(false);
    return this.router.navigate(['/rooms', roomId], { queryParams: { join: '1' } });
  }

  goHome(): Promise<boolean> {
    return this.router.navigate(['/']);
  }

  private applyResponse(response: GetHouseResponse): void {
    this.house.set(response.house);
    this.role.set(response.role);
  }

  private requireDisplayName(): boolean {
    if (this.displayName().trim()) return true;
    this.error.set('Enter your display name first.');
    return false;
  }

  private roomIdFromTitle(title: string): string {
    const slug = title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'room';

    return `${slug}-${crypto.randomUUID().slice(0, 8)}`;
  }

  private errorMessage(error: unknown, fallbackMessage: string): string {
    return error instanceof Error && error.message ? error.message : fallbackMessage;
  }
}
