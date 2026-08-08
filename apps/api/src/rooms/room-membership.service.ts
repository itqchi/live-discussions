import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser, ParticipantRole, RoomSummary } from '@live-discussions/contracts';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class RoomMembershipService {
  private readonly rolesByRoom = new Map<string, Map<string, ParticipantRole>>();
  private readonly roomTitles = new Map<string, string>();

  constructor(private readonly database: DatabaseService) {}

  async listRooms(): Promise<RoomSummary[]> {
    if (!this.database.configured) {
      return [...this.roomTitles.entries()]
        .map(([id, title]) => ({
          id,
          title,
          isLive: true,
          memberCount: this.rolesByRoom.get(id)?.size ?? 0,
        }))
        .sort((left, right) => left.title.localeCompare(right.title));
    }

    const result = await this.database.query<{
      id: string;
      title: string;
      member_count: string;
    }>(
      `SELECT room.id, room.title, COUNT(member.user_id)::text AS member_count
       FROM discussion_room room
       LEFT JOIN room_member member ON member.room_id = room.id
       GROUP BY room.id, room.title
       ORDER BY room.title ASC`,
    );

    return result.rows.map((room) => ({
      id: room.id,
      title: room.title,
      isLive: true,
      memberCount: Number(room.member_count),
    }));
  }

  async getRoomSummary(roomId: string): Promise<RoomSummary> {
    if (!this.database.configured) {
      const title = this.roomTitles.get(roomId);
      if (!title) throw new NotFoundException('Room not found.');

      return {
        id: roomId,
        title,
        isLive: true,
        memberCount: this.rolesByRoom.get(roomId)?.size ?? 0,
      };
    }

    const result = await this.database.query<{
      id: string;
      title: string;
      member_count: string;
    }>(
      `SELECT room.id, room.title, COUNT(member.user_id)::text AS member_count
       FROM discussion_room room
       LEFT JOIN room_member member ON member.room_id = room.id
       WHERE room.id = $1
       GROUP BY room.id, room.title`,
      [roomId],
    );

    const room = result.rows[0];
    if (!room) throw new NotFoundException('Room not found.');

    return {
      id: room.id,
      title: room.title,
      isLive: true,
      memberCount: Number(room.member_count),
    };
  }

  async createRoom(roomId: string, title: string, owner: AuthenticatedUser): Promise<void> {
    if (!this.database.configured) {
      if (this.roomTitles.has(roomId)) {
        throw new ConflictException('A room with this ID already exists.');
      }

      this.roomTitles.set(roomId, title);
      this.rolesByRoom.set(roomId, new Map([[owner.userId, 'owner']]));
      return;
    }

    await this.database.transaction(async (client) => {
      await client.query(
        `INSERT INTO app_user (id, display_name)
         VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE
         SET display_name = EXCLUDED.display_name, updated_at = NOW()`,
        [owner.userId, owner.displayName],
      );

      const existing = await client.query('SELECT id FROM discussion_room WHERE id = $1', [roomId]);
      if (existing.rows[0]) {
        throw new ConflictException('A room with this ID already exists.');
      }

      await client.query('INSERT INTO discussion_room (id, title) VALUES ($1, $2)', [roomId, title]);
      await client.query(
        'INSERT INTO room_member (room_id, user_id, role) VALUES ($1, $2, $3)',
        [roomId, owner.userId, 'owner'],
      );
    });
  }

  async resolveRole(roomId: string, user: AuthenticatedUser): Promise<ParticipantRole> {
    if (!this.database.configured) {
      const roomRoles = this.rolesByRoom.get(roomId);
      if (!roomRoles) throw new NotFoundException('Room not found. Create the room before joining.');

      const existingRole = roomRoles.get(user.userId);
      if (existingRole) return existingRole;

      roomRoles.set(user.userId, 'listener');
      return 'listener';
    }

    return this.database.transaction(async (client) => {
      const room = await client.query('SELECT id FROM discussion_room WHERE id = $1', [roomId]);
      if (!room.rows[0]) throw new NotFoundException('Room not found. Create the room before joining.');

      await client.query(
        `INSERT INTO app_user (id, display_name)
         VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE
         SET display_name = EXCLUDED.display_name, updated_at = NOW()`,
        [user.userId, user.displayName],
      );

      const existing = await client.query<{ role: ParticipantRole }>(
        'SELECT role FROM room_member WHERE room_id = $1 AND user_id = $2',
        [roomId, user.userId],
      );

      if (existing.rows[0]) return existing.rows[0].role;

      await client.query(
        'INSERT INTO room_member (room_id, user_id, role) VALUES ($1, $2, $3)',
        [roomId, user.userId, 'listener'],
      );

      return 'listener';
    });
  }

  async getRole(roomId: string, userId: string): Promise<ParticipantRole | null> {
    if (!this.database.configured) {
      return this.rolesByRoom.get(roomId)?.get(userId) ?? null;
    }

    const result = await this.database.query<{ role: ParticipantRole }>(
      'SELECT role FROM room_member WHERE room_id = $1 AND user_id = $2',
      [roomId, userId],
    );
    return result.rows[0]?.role ?? null;
  }

  async setRole(roomId: string, userId: string, role: ParticipantRole): Promise<void> {
    if (!this.database.configured) {
      const roomRoles = this.rolesByRoom.get(roomId);
      if (!roomRoles || !roomRoles.has(userId)) throw new NotFoundException('Participant is not a room member.');
      roomRoles.set(userId, role);
      return;
    }

    const result = await this.database.query(
      'UPDATE room_member SET role = $3 WHERE room_id = $1 AND user_id = $2',
      [roomId, userId, role],
    );
    if (result.rowCount === 0) throw new NotFoundException('Participant is not a room member.');
  }
}
