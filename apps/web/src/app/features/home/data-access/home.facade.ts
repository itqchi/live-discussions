import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { HouseSummary, RoomSummary } from '@live-discussions/contracts';
import { DevIdentityService } from '../../../core/dev-identity.service';
import { HouseApiService } from '../../houses/data-access/house-api.service';
import { RoomApiService } from '../../rooms/data-access/room-api.service';

@Injectable()
export class HomeFacade {
  private readonly router = inject(Router);
  private readonly identity = inject(DevIdentityService);
  private readonly roomsApi = inject(RoomApiService);
  private readonly housesApi = inject(HouseApiService);

  readonly displayName = this.identity.displayName;
  readonly rooms = signal<RoomSummary[]>([]);
  readonly houses = signal<HouseSummary[]>([]);
  readonly loading = signal(false);
  readonly creatingRoom = signal(false);
  readonly creatingHouse = signal(false);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const [rooms, houses] = await Promise.all([
        this.roomsApi.listRooms(),
        this.housesApi.listHouses(),
      ]);
      this.rooms.set(rooms);
      this.houses.set(houses);
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to load the home feed.'));
    } finally {
      this.loading.set(false);
    }
  }

  setDisplayName(displayName: string): void {
    this.identity.setDisplayName(displayName);
  }

  async joinRoom(roomId: string): Promise<void> {
    if (!this.requireDisplayName()) return;
    await this.router.navigate(['/rooms', roomId], { queryParams: { join: '1' } });
  }

  async createRoom(title: string): Promise<void> {
    const normalizedTitle = title.trim();
    if (!normalizedTitle || !this.requireDisplayName()) {
      if (!normalizedTitle) this.error.set('Enter a room title.');
      return;
    }

    this.creatingRoom.set(true);
    this.error.set(null);

    try {
      const roomId = this.roomIdFromTitle(normalizedTitle);
      await this.roomsApi.createRoom(
        { roomId, title: normalizedTitle },
        this.identity.userId,
        this.displayName(),
      );
      await this.router.navigate(['/rooms', roomId], { queryParams: { join: '1' } });
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to create the room.'));
    } finally {
      this.creatingRoom.set(false);
    }
  }

  async createHouse(name: string, description: string): Promise<void> {
    const normalizedName = name.trim();
    if (!normalizedName || !this.requireDisplayName()) {
      if (!normalizedName) this.error.set('Enter a house name.');
      return;
    }

    this.creatingHouse.set(true);
    this.error.set(null);

    try {
      const response = await this.housesApi.createHouse(
        { name: normalizedName, description: description.trim() },
        this.identity.userId,
        this.displayName(),
      );
      this.houses.update((houses) => [...houses, response.house].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to create the house.'));
    } finally {
      this.creatingHouse.set(false);
    }
  }

  async joinHouse(houseId: string): Promise<void> {
    if (!this.requireDisplayName()) return;
    this.error.set(null);

    try {
      const response = await this.housesApi.joinHouse(
        { houseId },
        this.identity.userId,
        this.displayName(),
      );
      this.houses.update((houses) =>
        houses.map((house) => (house.id === response.house.id ? response.house : house)),
      );
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to join the house.'));
    }
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
