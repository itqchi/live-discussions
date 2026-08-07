import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser, ParticipantRole } from '@live-discussions/contracts';

@Injectable()
export class RoomMembershipService {
  private readonly rolesByRoom = new Map<string, Map<string, ParticipantRole>>();

  resolveRole(roomId: string, user: AuthenticatedUser): ParticipantRole {
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
