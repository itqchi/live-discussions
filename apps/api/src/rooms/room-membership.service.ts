import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AuthenticatedUser,
  ParticipantRole,
  RoomBannedUser,
  RoomSummary,
  UpdateRoomSettingsRequest,
} from '@live-discussions/contracts';
import { randomUUID } from 'node:crypto';

export interface RoomMembershipState {
  role: ParticipantRole;
  onStage: boolean;
}

interface LiveRoomRecord {
  id: string;
  slug: string;
  title: string;
  description: string;
  isLocked: boolean;
  houseId: string | null;
  members: Map<string, RoomMembershipState>;
  memberNames: Map<string, string>;
  bannedUsers: Map<string, string>;
}

const MAX_ROOM_SLUG_LENGTH = 80;
const MAX_SLUG_ATTEMPTS = 10_000;

@Injectable()
export class RoomMembershipService {
  private readonly roomsById = new Map<string, LiveRoomRecord>();
  private readonly roomIdBySlug = new Map<string, string>();

  async listRooms(): Promise<RoomSummary[]> {
    return [...this.roomsById.values()]
      .map((room) => this.toSummary(room))
      .sort((left, right) => left.title.localeCompare(right.title));
  }

  async listRoomsForHouse(houseId: string): Promise<RoomSummary[]> {
    return [...this.roomsById.values()]
      .filter((room) => room.houseId === houseId)
      .map((room) => this.toSummary(room))
      .sort((left, right) => left.title.localeCompare(right.title));
  }

  async getRoomSummary(identifier: string): Promise<RoomSummary> {
    const roomId = await this.resolveRoomId(identifier);
    return this.toSummary(this.getRoom(roomId));
  }

  async getHouseId(identifier: string): Promise<string | null> {
    const roomId = await this.resolveRoomId(identifier);
    return this.getRoom(roomId).houseId;
  }

  async createRoom(
    baseSlug: string,
    title: string,
    owner: AuthenticatedUser,
    houseId: string | null = null,
  ): Promise<RoomSummary> {
    const slug = this.allocateSlug(baseSlug);
    const id = randomUUID();
    const room: LiveRoomRecord = {
      id,
      slug,
      title,
      description: '',
      isLocked: false,
      houseId,
      members: new Map([[owner.userId, { role: 'owner', onStage: true }]]),
      memberNames: new Map([[owner.userId, owner.displayName]]),
      bannedUsers: new Map(),
    };

    this.roomsById.set(id, room);
    this.roomIdBySlug.set(slug, id);
    return this.toSummary(room);
  }

  async updateRoomSettings(
    identifier: string,
    request: UpdateRoomSettingsRequest,
  ): Promise<RoomSummary> {
    const roomId = await this.resolveRoomId(identifier);
    const room = this.getRoom(roomId);
    room.title = request.title;
    room.description = request.description;
    room.isLocked = request.isLocked;
    return this.toSummary(room);
  }

  async resolveRoomId(identifier: string): Promise<string> {
    if (this.roomsById.has(identifier)) return identifier;
    const roomId = this.roomIdBySlug.get(identifier);
    if (!roomId) throw new NotFoundException('Room not found.');
    return roomId;
  }

  async resolveMembership(identifier: string, user: AuthenticatedUser): Promise<RoomMembershipState> {
    const roomId = await this.resolveRoomId(identifier);
    const room = this.getRoom(roomId);

    if (room.bannedUsers.has(user.userId)) {
      throw new ForbiddenException('You have been banned from this room.');
    }

    const existing = room.members.get(user.userId);
    if (existing) {
      room.memberNames.set(user.userId, user.displayName);
      return { ...existing };
    }

    if (room.isLocked) {
      throw new ForbiddenException('This room is locked to new participants.');
    }

    const membership: RoomMembershipState = { role: 'listener', onStage: false };
    room.members.set(user.userId, membership);
    room.memberNames.set(user.userId, user.displayName);
    return { ...membership };
  }

  async resolveRole(identifier: string, user: AuthenticatedUser): Promise<ParticipantRole> {
    return (await this.resolveMembership(identifier, user)).role;
  }

  async deleteRoom(identifier: string): Promise<string> {
    const roomId = await this.resolveRoomId(identifier);
    const room = this.getRoom(roomId);
    this.roomIdBySlug.delete(room.slug);
    this.roomsById.delete(roomId);
    return roomId;
  }

  pruneMissingRooms(activeLiveKitRoomIds: ReadonlySet<string>): string[] {
    const removed: string[] = [];
    for (const room of [...this.roomsById.values()]) {
      if (activeLiveKitRoomIds.has(room.id)) continue;
      this.roomIdBySlug.delete(room.slug);
      this.roomsById.delete(room.id);
      removed.push(room.id);
    }
    return removed;
  }

  async getRole(identifier: string, userId: string): Promise<ParticipantRole | null> {
    return (await this.getMembership(identifier, userId))?.role ?? null;
  }

  async getMembership(identifier: string, userId: string): Promise<RoomMembershipState | null> {
    let roomId: string;
    try {
      roomId = await this.resolveRoomId(identifier);
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }

    const membership = this.roomsById.get(roomId)?.members.get(userId);
    return membership ? { ...membership } : null;
  }

  async listBannedUsers(identifier: string): Promise<RoomBannedUser[]> {
    const roomId = await this.resolveRoomId(identifier);
    return [...this.getRoom(roomId).bannedUsers.entries()]
      .map(([userId, displayName]) => ({ userId, displayName }))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  async isBanned(identifier: string, userId: string): Promise<boolean> {
    const roomId = await this.resolveRoomId(identifier);
    return this.getRoom(roomId).bannedUsers.has(userId);
  }

  async setBanned(identifier: string, userId: string, banned: boolean): Promise<void> {
    const roomId = await this.resolveRoomId(identifier);
    const room = this.getRoom(roomId);
    if (!room.members.has(userId)) throw new NotFoundException('Participant is not a room member.');

    if (banned) room.bannedUsers.set(userId, room.memberNames.get(userId) ?? userId);
    else room.bannedUsers.delete(userId);
  }

  async setMembershipState(
    identifier: string,
    userId: string,
    state: RoomMembershipState,
  ): Promise<void> {
    const roomId = await this.resolveRoomId(identifier);
    const room = this.getRoom(roomId);
    if (!room.members.has(userId)) throw new NotFoundException('Participant is not a room member.');
    room.members.set(userId, { ...state });
  }

  async setStagePresence(identifier: string, userId: string, onStage: boolean): Promise<void> {
    const membership = await this.getMembership(identifier, userId);
    if (!membership) throw new NotFoundException('Participant is not a room member.');
    await this.setMembershipState(identifier, userId, { ...membership, onStage });
  }

  async setRole(identifier: string, userId: string, role: ParticipantRole): Promise<void> {
    const membership = await this.getMembership(identifier, userId);
    if (!membership) throw new NotFoundException('Participant is not a room member.');
    await this.setMembershipState(identifier, userId, {
      role,
      onStage: role !== 'listener',
    });
  }

  async ensureRole(
    identifier: string,
    userId: string,
    role: ParticipantRole,
    displayName = userId,
  ): Promise<void> {
    const roomId = await this.resolveRoomId(identifier);
    const room = this.getRoom(roomId);
    const current = room.members.get(userId);
    room.memberNames.set(userId, displayName);
    if (current?.role === 'owner') return;

    room.members.set(userId, {
      role,
      onStage: role === 'listener' ? false : current?.onStage ?? true,
    });
  }

  private allocateSlug(baseSlug: string): string {
    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
      const candidate = this.slugCandidate(baseSlug, attempt);
      if (!this.roomIdBySlug.has(candidate)) return candidate;
    }
    throw new ConflictException('Unable to allocate a unique public room URL.');
  }

  private slugCandidate(baseSlug: string, attempt: number): string {
    if (attempt <= 1) return baseSlug.slice(0, MAX_ROOM_SLUG_LENGTH);
    const suffix = `-${attempt}`;
    const prefixLength = Math.max(1, MAX_ROOM_SLUG_LENGTH - suffix.length);
    return `${baseSlug.slice(0, prefixLength)}${suffix}`;
  }

  private getRoom(roomId: string): LiveRoomRecord {
    const room = this.roomsById.get(roomId);
    if (!room) throw new NotFoundException('Room not found.');
    return room;
  }

  private toSummary(room: LiveRoomRecord): RoomSummary {
    return {
      id: room.id,
      slug: room.slug,
      title: room.title,
      description: room.description,
      isLive: true,
      isLocked: room.isLocked,
      memberCount: Math.max(0, room.members.size - room.bannedUsers.size),
    };
  }
}
