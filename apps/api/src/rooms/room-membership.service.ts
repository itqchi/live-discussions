import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AuthenticatedUser,
  ParticipantRole,
  RoomSummary,
  UpdateRoomSettingsRequest,
} from '@live-discussions/contracts';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';

export interface RoomMembershipState {
  role: ParticipantRole;
  onStage: boolean;
}

interface MemoryRoom {
  id: string;
  slug: string;
  title: string;
  description: string;
  isLocked: boolean;
  members: Map<string, RoomMembershipState>;
}

interface DatabaseErrorLike {
  code?: string;
}

const MAX_ROOM_SLUG_LENGTH = 80;
const MAX_SLUG_ATTEMPTS = 10_000;

@Injectable()
export class RoomMembershipService {
  private readonly roomsById = new Map<string, MemoryRoom>();
  private readonly roomIdBySlug = new Map<string, string>();

  constructor(private readonly database: DatabaseService) {}

  async listRooms(): Promise<RoomSummary[]> {
    if (!this.database.configured) {
      return [...this.roomsById.values()]
        .map((room) => this.toMemorySummary(room))
        .sort((left, right) => left.title.localeCompare(right.title));
    }

    const result = await this.database.query<{
      id: string;
      slug: string;
      title: string;
      description: string;
      is_locked: boolean;
      member_count: string;
    }>(
      `SELECT room.id, room.slug, room.title, room.description, room.is_locked,
              COUNT(member.user_id)::text AS member_count
       FROM discussion_room room
       LEFT JOIN room_member member ON member.room_id = room.id
       GROUP BY room.id, room.slug, room.title, room.description, room.is_locked
       ORDER BY room.title ASC`,
    );

    return result.rows.map((room) => ({
      id: room.id,
      slug: room.slug,
      title: room.title,
      description: room.description,
      isLive: true,
      isLocked: room.is_locked,
      memberCount: Number(room.member_count),
    }));
  }

  async getRoomSummary(identifier: string): Promise<RoomSummary> {
    const roomId = await this.resolveRoomId(identifier);

    if (!this.database.configured) {
      return this.toMemorySummary(this.getMemoryRoom(roomId));
    }

    const result = await this.database.query<{
      id: string;
      slug: string;
      title: string;
      description: string;
      is_locked: boolean;
      member_count: string;
    }>(
      `SELECT room.id, room.slug, room.title, room.description, room.is_locked,
              COUNT(member.user_id)::text AS member_count
       FROM discussion_room room
       LEFT JOIN room_member member ON member.room_id = room.id
       WHERE room.id = $1
       GROUP BY room.id, room.slug, room.title, room.description, room.is_locked`,
      [roomId],
    );

    const room = result.rows[0];
    if (!room) throw new NotFoundException('Room not found.');

    return {
      id: room.id,
      slug: room.slug,
      title: room.title,
      description: room.description,
      isLive: true,
      isLocked: room.is_locked,
      memberCount: Number(room.member_count),
    };
  }

  async createRoom(baseSlug: string, title: string, owner: AuthenticatedUser): Promise<RoomSummary> {
    if (!this.database.configured) {
      const slug = this.allocateMemorySlug(baseSlug);
      const id = randomUUID();
      const room: MemoryRoom = {
        id,
        slug,
        title,
        description: '',
        isLocked: false,
        members: new Map([[owner.userId, { role: 'owner', onStage: true }]]),
      };
      this.roomsById.set(id, room);
      this.roomIdBySlug.set(slug, id);
      return this.toMemorySummary(room);
    }

    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
      const slug = this.slugCandidate(baseSlug, attempt);
      const id = randomUUID();

      try {
        await this.database.transaction(async (client) => {
          await client.query(
            `INSERT INTO app_user (id, display_name)
             VALUES ($1, $2)
             ON CONFLICT (id) DO UPDATE
             SET display_name = EXCLUDED.display_name, updated_at = NOW()`,
            [owner.userId, owner.displayName],
          );

          await client.query(
            `INSERT INTO discussion_room (id, slug, title, is_live, description, is_locked)
             VALUES ($1, $2, $3, TRUE, '', FALSE)`,
            [id, slug, title],
          );
          await client.query(
            `INSERT INTO room_member (room_id, user_id, role, on_stage)
             VALUES ($1, $2, 'owner', TRUE)`,
            [id, owner.userId],
          );
        });
        return {
          id,
          slug,
          title,
          description: '',
          isLive: true,
          isLocked: false,
          memberCount: 1,
        };
      } catch (error) {
        if (this.isUniqueViolation(error)) continue;
        throw error;
      }
    }

    throw new ConflictException('Unable to allocate a unique public room URL.');
  }

  async updateRoomSettings(
    identifier: string,
    request: UpdateRoomSettingsRequest,
  ): Promise<RoomSummary> {
    const roomId = await this.resolveRoomId(identifier);

    if (!this.database.configured) {
      const room = this.getMemoryRoom(roomId);
      room.title = request.title;
      room.description = request.description;
      room.isLocked = request.isLocked;
      return this.toMemorySummary(room);
    }

    const result = await this.database.query(
      `UPDATE discussion_room
       SET title = $2, description = $3, is_locked = $4
       WHERE id = $1`,
      [roomId, request.title, request.description, request.isLocked],
    );
    if (result.rowCount === 0) throw new NotFoundException('Room not found.');
    return this.getRoomSummary(roomId);
  }

  async resolveRoomId(identifier: string): Promise<string> {
    if (!this.database.configured) {
      if (this.roomsById.has(identifier)) return identifier;
      const roomId = this.roomIdBySlug.get(identifier);
      if (!roomId) throw new NotFoundException('Room not found.');
      return roomId;
    }

    const result = await this.database.query<{ id: string }>(
      'SELECT id FROM discussion_room WHERE id = $1 OR slug = $1 LIMIT 1',
      [identifier],
    );
    if (!result.rows[0]) throw new NotFoundException('Room not found.');
    return result.rows[0].id;
  }

  async resolveMembership(identifier: string, user: AuthenticatedUser): Promise<RoomMembershipState> {
    const roomId = await this.resolveRoomId(identifier);

    if (!this.database.configured) {
      const room = this.getMemoryRoom(roomId);
      const existing = room.members.get(user.userId);
      if (existing) return { ...existing };

      const membership: RoomMembershipState = { role: 'listener', onStage: false };
      room.members.set(user.userId, membership);
      return { ...membership };
    }

    return this.database.transaction(async (client) => {
      await client.query(
        `INSERT INTO app_user (id, display_name)
         VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE
         SET display_name = EXCLUDED.display_name, updated_at = NOW()`,
        [user.userId, user.displayName],
      );

      await client.query(
        `INSERT INTO room_member (room_id, user_id, role, on_stage)
         VALUES ($1, $2, 'listener', FALSE)
         ON CONFLICT (room_id, user_id) DO NOTHING`,
        [roomId, user.userId],
      );

      const result = await client.query<{ role: ParticipantRole; on_stage: boolean }>(
        'SELECT role, on_stage FROM room_member WHERE room_id = $1 AND user_id = $2',
        [roomId, user.userId],
      );
      const membership = result.rows[0];
      if (!membership) throw new NotFoundException('Room membership could not be resolved.');
      return { role: membership.role, onStage: membership.on_stage };
    });
  }

  async resolveRole(identifier: string, user: AuthenticatedUser): Promise<ParticipantRole> {
    return (await this.resolveMembership(identifier, user)).role;
  }

  async deleteRoom(identifier: string): Promise<string> {
    const roomId = await this.resolveRoomId(identifier);

    if (!this.database.configured) {
      const room = this.getMemoryRoom(roomId);
      this.roomIdBySlug.delete(room.slug);
      this.roomsById.delete(roomId);
      return roomId;
    }

    const result = await this.database.query<{ id: string }>(
      'DELETE FROM discussion_room WHERE id = $1 RETURNING id',
      [roomId],
    );
    if (!result.rows[0]) throw new NotFoundException('Room not found.');
    return roomId;
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

    if (!this.database.configured) {
      const membership = this.roomsById.get(roomId)?.members.get(userId);
      return membership ? { ...membership } : null;
    }

    const result = await this.database.query<{ role: ParticipantRole; on_stage: boolean }>(
      'SELECT role, on_stage FROM room_member WHERE room_id = $1 AND user_id = $2',
      [roomId, userId],
    );
    const membership = result.rows[0];
    return membership ? { role: membership.role, onStage: membership.on_stage } : null;
  }

  async setMembershipState(
    identifier: string,
    userId: string,
    state: RoomMembershipState,
  ): Promise<void> {
    const roomId = await this.resolveRoomId(identifier);

    if (!this.database.configured) {
      const room = this.getMemoryRoom(roomId);
      if (!room.members.has(userId)) throw new NotFoundException('Participant is not a room member.');
      room.members.set(userId, { ...state });
      return;
    }

    const result = await this.database.query(
      'UPDATE room_member SET role = $3, on_stage = $4 WHERE room_id = $1 AND user_id = $2',
      [roomId, userId, state.role, state.onStage],
    );
    if (result.rowCount === 0) throw new NotFoundException('Participant is not a room member.');
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
    const defaultOnStage = role !== 'listener';

    if (!this.database.configured) {
      const room = this.getMemoryRoom(roomId);
      const current = room.members.get(userId);
      if (current?.role === 'owner') return;
      room.members.set(userId, {
        role,
        onStage: role === 'listener' ? false : current?.onStage ?? defaultOnStage,
      });
      return;
    }

    await this.database.transaction(async (client) => {
      await client.query(
        `INSERT INTO app_user (id, display_name)
         VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = NOW()`,
        [userId, displayName],
      );
      await client.query(
        `INSERT INTO room_member (room_id, user_id, role, on_stage)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (room_id, user_id) DO UPDATE
         SET role = CASE
               WHEN room_member.role = 'owner' THEN room_member.role
               ELSE EXCLUDED.role
             END,
             on_stage = CASE
               WHEN room_member.role = 'owner' THEN room_member.on_stage
               WHEN EXCLUDED.role = 'listener' THEN FALSE
               ELSE room_member.on_stage
             END`,
        [roomId, userId, role, defaultOnStage],
      );
    });
  }

  private allocateMemorySlug(baseSlug: string): string {
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

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object'
      && error !== null
      && (error as DatabaseErrorLike).code === '23505';
  }

  private getMemoryRoom(roomId: string): MemoryRoom {
    const room = this.roomsById.get(roomId);
    if (!room) throw new NotFoundException('Room not found.');
    return room;
  }

  private toMemorySummary(room: MemoryRoom): RoomSummary {
    return {
      id: room.id,
      slug: room.slug,
      title: room.title,
      description: room.description,
      isLive: true,
      isLocked: room.isLocked,
      memberCount: room.members.size,
    };
  }
}
