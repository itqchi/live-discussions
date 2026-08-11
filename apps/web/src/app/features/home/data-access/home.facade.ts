import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { HouseSummary, RoomSummary } from '@live-discussions/contracts';
import { DevIdentityService } from '../../../core/dev-identity.service';
import { RoomNavigationService } from '../../../core/room-navigation.service';
import { HouseApiService } from '../../houses/data-access/house-api.service';
import { RoomApiService } from '../../rooms/data-access/room-api.service';

@Injectable()
export class HomeFacade {
  private readonly router = inject(Router);
  private readonly identity = inject(DevIdentityService);
  private readonly navigation = inject(RoomNavigationService);
  private readonly roomsApi = inject(RoomApiService);
  private readonly housesApi = inject(HouseApiService);

  readonly displayName = this.identity.displayName;
  readonly rooms = signal<RoomSummary[]>([]);
  readonly houses = signal<HouseSummary[]>([]);
  readonly loading = signal(false);
  readonly creatingRoom = signal(false);
  readonly creatingHouse = signal(false);
  readonly joiningHouseId = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    if (this.loading()) return;

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

  houseForRoom(roomId: string): HouseSummary | null {
    return this.houses().find((house) => house.roomIds.includes(roomId)) ?? null;
  }

  async joinRoom(roomId: string): Promise<void> {
    if (!this.requireDisplayName()) return;
    const room = this.rooms().find((candidate) => candidate.id === roomId);
    if (!room) {
      this.error.set('Room not found.');
      return;
    }

    this.navigation.rememberOrigin(room.slug, '/');
    await this.router.navigate(['/room', room.slug]);
  }

  async createRoom(title: string, description = '', isLocked = false): Promise<void> {
    if (this.creatingRoom()) return;

    const normalizedTitle = title.trim();
    const normalizedDescription = description.trim();
    if (!normalizedTitle || !this.requireDisplayName()) {
      if (!normalizedTitle) this.error.set('Enter a room title.');
      return;
    }

    this.creatingRoom.set(true);
    this.error.set(null);
    try {
      const response = await this.roomsApi.createRoom({ title: normalizedTitle });
      if (normalizedDescription || isLocked) {
        try {
          await this.roomsApi.updateRoomSettings(response.room.id, {
            title: normalizedTitle,
            description: normalizedDescription,
            isLocked,
          });
        } catch {
          // Room creation succeeded; its Settings panel can retry optional setup later.
        }
      }
      this.navigation.rememberOrigin(response.room.slug, '/');
      await this.router.navigate(['/room', response.room.slug]);
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to create the room.'));
    } finally {
      this.creatingRoom.set(false);
    }
  }

  async createHouse(name: string, description: string): Promise<void> {
    if (this.creatingHouse()) return;

    const normalizedName = name.trim();
    if (!normalizedName || !this.requireDisplayName()) {
      if (!normalizedName) this.error.set('Enter a house name.');
      return;
    }

    this.creatingHouse.set(true);
    this.error.set(null);
    try {
      const response = await this.housesApi.createHouse({
        name: normalizedName,
        description: description.trim(),
      });
      await this.router.navigate(['/houses', response.house.id]);
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to create the house.'));
    } finally {
      this.creatingHouse.set(false);
    }
  }

  async joinHouse(houseId: string): Promise<void> {
    if (this.joiningHouseId() || !this.requireDisplayName()) return;

    this.joiningHouseId.set(houseId);
    this.error.set(null);
    try {
      await this.housesApi.joinHouse({ houseId });
      await this.router.navigate(['/houses', houseId]);
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to join the house.'));
    } finally {
      this.joiningHouseId.set(null);
    }
  }

  openHouse(houseId: string): Promise<boolean> {
    return this.router.navigate(['/houses', houseId]);
  }

  private requireDisplayName(): boolean {
    if (this.displayName().trim()) return true;
    this.error.set('Enter your display name first.');
    return false;
  }

  private errorMessage(error: unknown, fallbackMessage: string): string {
    return error instanceof Error && error.message ? error.message : fallbackMessage;
  }
}
