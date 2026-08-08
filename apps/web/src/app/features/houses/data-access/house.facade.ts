import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type {
  GetHouseResponse,
  HouseDetail,
  HouseMemberRole,
} from '@live-discussions/contracts';
import { DevIdentityService } from '../../../core/dev-identity.service';
import { roomSlugFromName } from '../../../core/room-route.util';
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
  readonly updatingMemberId = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly canManageMembers = computed(() => this.role() === 'owner');

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
    if (!house || !normalizedTitle || !this.requireDisplayName()) {
      if (!normalizedTitle) this.error.set('Enter a room title.');
      return;
    }

    this.creatingRoom.set(true);
    this.error.set(null);

    try {
      const roomId = roomSlugFromName(normalizedTitle);
      await this.api.createRoom(
        house.id,
        { roomId, title: normalizedTitle },
        this.identity.userId,
        this.displayName(),
      );
      await this.router.navigate(['/rooms', roomId]);
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to create a room in this House.'));
    } finally {
      this.creatingRoom.set(false);
    }
  }

  joinRoom(roomId: string): Promise<boolean> {
    if (!this.requireDisplayName()) return Promise.resolve(false);
    return this.router.navigate(['/rooms', roomId]);
  }

  goHome(): Promise<boolean> {
    return this.router.navigate(['/']);
  }

  private async updateMemberRole(userId: string, role: 'admin' | 'member'): Promise<void> {
    const house = this.house();
    if (!house || !this.canManageMembers()) return;

    this.updatingMemberId.set(userId);
    this.error.set(null);

    try {
      const member = await this.api.updateMemberRole(
        house.id,
        { userId, role },
        this.identity.userId,
        this.displayName(),
      );
      this.house.update((current) => current ? {
        ...current,
        members: current.members.map((existing) => existing.userId === member.userId ? member : existing),
      } : current);
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
