import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { GetHouseResponse, HouseDetail, HouseMemberRole } from '@live-discussions/contracts';
import { DevIdentityService } from '../../../core/dev-identity.service';
import { RoomNavigationService } from '../../../core/room-navigation.service';
import { HouseApiService } from './house-api.service';

@Injectable()
export class HouseFacade {
  private readonly router = inject(Router);
  private readonly identity = inject(DevIdentityService);
  private readonly navigation = inject(RoomNavigationService);
  private readonly api = inject(HouseApiService);

  readonly displayName = this.identity.displayName;
  readonly house = signal<HouseDetail | null>(null);
  readonly role = signal<HouseMemberRole | null>(null);
  readonly loading = signal(false);
  readonly joining = signal(false);
  readonly creatingRoom = signal(false);
  readonly updatingMemberId = signal<string | null>(null);
  readonly closingRoomId = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly canManageMembers = computed(() => this.role() === 'owner');
  readonly canManageRooms = computed(() => this.role() === 'owner' || this.role() === 'admin');

  async load(houseId: string): Promise<void> {
    if (this.loading()) return;

    this.loading.set(true);
    this.error.set(null);
    try {
      this.applyResponse(await this.api.getHouse(houseId));
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
    if (this.joining() || !house || !this.requireDisplayName()) return;

    this.joining.set(true);
    this.error.set(null);
    try {
      const response = await this.api.joinHouse({ houseId: house.id });
      this.house.update((current) =>
        current ? { ...current, memberCount: response.house.memberCount } : current,
      );
      this.role.set(response.role);
      await this.load(house.id);
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to join the House.'));
    } finally {
      this.joining.set(false);
    }
  }

  promoteToAdmin(userId: string): Promise<void> {
    return this.updateMemberRole(userId, 'admin');
  }

  demoteToMember(userId: string): Promise<void> {
    return this.updateMemberRole(userId, 'member');
  }

  async createRoom(title: string): Promise<void> {
    const house = this.house();
    const normalizedTitle = title.trim();
    if (this.creatingRoom() || !house || !normalizedTitle || !this.requireDisplayName()) {
      if (!normalizedTitle) this.error.set('Enter a room title.');
      return;
    }

    this.creatingRoom.set(true);
    this.error.set(null);
    try {
      const response = await this.api.createRoom(house.id, { title: normalizedTitle });
      this.navigation.rememberOrigin(response.room.slug, `/houses/${house.id}`);
      await this.router.navigate(['/room', response.room.slug]);
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to create a room in this House.'));
    } finally {
      this.creatingRoom.set(false);
    }
  }

  joinRoom(roomId: string): Promise<boolean> {
    const house = this.house();
    if (!house || !this.requireDisplayName()) return Promise.resolve(false);

    const room = house.rooms.find((candidate) => candidate.id === roomId);
    if (!room) {
      this.error.set('Room not found.');
      return Promise.resolve(false);
    }

    this.navigation.rememberOrigin(room.slug, `/houses/${house.id}`);
    return this.router.navigate(['/room', room.slug]);
  }

  async closeRoom(roomId: string): Promise<void> {
    const house = this.house();
    if (this.closingRoomId() || !house || !this.canManageRooms()) return;

    this.closingRoomId.set(roomId);
    this.error.set(null);
    try {
      await this.api.closeRoom(house.id, roomId);
      this.house.update((current) =>
        current
          ? {
              ...current,
              roomCount: Math.max(0, current.roomCount - 1),
              roomIds: current.roomIds.filter((id) => id !== roomId),
              rooms: current.rooms.filter((room) => room.id !== roomId),
            }
          : current,
      );
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to close the room.'));
    } finally {
      this.closingRoomId.set(null);
    }
  }

  goHome(): Promise<boolean> {
    return this.router.navigate(['/']);
  }

  private async updateMemberRole(userId: string, role: 'admin' | 'member'): Promise<void> {
    const house = this.house();
    if (this.updatingMemberId() || !house || !this.canManageMembers()) return;

    this.updatingMemberId.set(userId);
    this.error.set(null);
    try {
      const member = await this.api.updateMemberRole(house.id, { userId, role });
      this.house.update((current) =>
        current
          ? {
              ...current,
              members: current.members.map((existing) =>
                existing.userId === member.userId ? member : existing,
              ),
            }
          : current,
      );
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to update the House member role.'));
    } finally {
      this.updatingMemberId.set(null);
    }
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

  private errorMessage(error: unknown, fallbackMessage: string): string {
    return error instanceof Error && error.message ? error.message : fallbackMessage;
  }
}
