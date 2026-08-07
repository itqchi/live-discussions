import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser, ParticipantRole } from '@live-discussions/contracts';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class RoomMembershipService {
  private readonly rolesByRoom = new Map<string, Map<string, ParticipantRole>>();

  constructor(private readonly database: DatabaseService) {}

  async resolveRole(roomId: string, user: AuthenticatedUser): Promise<ParticipantRole> {
    if (!this.database.configured) {
      return this.resolveInMemory(roomId, user);
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
        `INSERT INTO discussion_room (id, title)
         VALUES ($1, $1)
         ON CONFLICT (id) DO NOTHING`,
        [roomId],
      );

      await client.query('SELECT id FROM discussion_room WHERE id = $1 FOR UPDATE', [roomId]);

      const existing = await client.query<{ role: ParticipantRole }>(
        'SELECT role FROM room_member WHERE room_id = $1 AND user_id = $2',
        [roomId, user.userId],
      );

      if (existing.rows[0]) {
        return existing.rows[0].role;
      }

      const memberCount = await client.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM room_member WHERE room_id = $1',
        [roomId],
      );

      const role: ParticipantRole = Number(memberCount.rows[0]?.count ?? 0) === 0 ? 'owner' : 'listener';

      await client.query(
        'INSERT INTO room_member (room_id, user_id, role) VALUES ($1, $2, $3)',
        [roomId, user.userId, role],
      );

      return role;
    });
  }

  private resolveInMemory(roomId: string, user: AuthenticatedUser): ParticipantRole {
    let roomRoles = this.rolesByRoom.get(roomId);

    if (!roomRoles) {
      roomRoles = new Map<string, ParticipantRole>();
      this.rolesByRoom.set(roomId, roomRoles);
    }

    const existingRole = roomRoles.get(user.userId);
    if (existingRole) return existingRole;

    const role: ParticipantRole = roomRoles.size === 0 ? 'owner' : 'listener';
    roomRoles.set(user.userId, role);
    return role;
  }
}
