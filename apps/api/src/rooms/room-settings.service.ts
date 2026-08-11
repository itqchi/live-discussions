import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  AuthenticatedUser,
  RoomSummary,
  UpdateRoomSettingsRequest,
} from '@live-discussions/contracts';
import { RoomMembershipService } from './room-membership.service';

@Injectable()
export class RoomSettingsService {
  constructor(private readonly memberships: RoomMembershipService) {}

  getRoom(identifier: string): Promise<RoomSummary> {
    return this.memberships.getRoomSummary(identifier);
  }

  async updateRoom(
    identifier: string,
    request: UpdateRoomSettingsRequest,
    actor: AuthenticatedUser,
  ): Promise<RoomSummary> {
    const roomId = await this.memberships.resolveRoomId(identifier);
    const role = await this.memberships.getRole(roomId, actor.userId);
    if (role !== 'owner' && role !== 'moderator') {
      throw new ForbiddenException('Only owners and moderators can update room settings.');
    }

    return this.memberships.updateRoomSettings(roomId, request);
  }
}
