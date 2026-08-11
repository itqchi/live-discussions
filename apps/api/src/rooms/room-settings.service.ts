import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  AuthenticatedUser,
  RoomBannedUser,
  RoomSummary,
  UpdateRoomSettingsRequest,
} from '@live-discussions/contracts';
import { RoomMembershipService } from './room-membership.service';
import { RoomsService } from './rooms.service';

@Injectable()
export class RoomSettingsService {
  constructor(
    private readonly memberships: RoomMembershipService,
    private readonly rooms: RoomsService,
  ) {}

  getRoom(identifier: string): Promise<RoomSummary> {
    return this.memberships.getRoomSummary(identifier);
  }

  async updateRoom(
    identifier: string,
    request: UpdateRoomSettingsRequest,
    actor: AuthenticatedUser,
  ): Promise<RoomSummary> {
    const roomId = await this.memberships.resolveRoomId(identifier);
    await this.assertCanModerate(roomId, actor.userId);
    return this.memberships.updateRoomSettings(roomId, request);
  }

  async listBannedUsers(identifier: string, actor: AuthenticatedUser): Promise<RoomBannedUser[]> {
    const roomId = await this.memberships.resolveRoomId(identifier);
    await this.assertCanModerate(roomId, actor.userId);
    return this.memberships.listBannedUsers(roomId);
  }

  async banParticipant(
    identifier: string,
    participantId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const roomId = await this.memberships.resolveRoomId(identifier);
    await this.assertCanModerate(roomId, actor.userId);

    if (participantId === actor.userId) {
      throw new ForbiddenException('You cannot ban yourself from the room.');
    }

    const targetRole = await this.memberships.getRole(roomId, participantId);
    if (!targetRole) throw new ForbiddenException('Participant is not a room member.');
    if (targetRole === 'owner') throw new ForbiddenException('The room owner cannot be banned.');
    if (targetRole === 'moderator') {
      throw new ForbiddenException(
        'A House admin cannot be banned from an individual room. Change their House admin role instead.',
      );
    }

    await this.memberships.setBanned(roomId, participantId, true);
    try {
      await this.rooms.removeParticipant({ roomId, participantId }, actor);
    } catch (error) {
      await this.memberships.setBanned(roomId, participantId, false);
      throw error;
    }
  }

  async unbanParticipant(
    identifier: string,
    participantId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const roomId = await this.memberships.resolveRoomId(identifier);
    await this.assertCanModerate(roomId, actor.userId);
    await this.memberships.setBanned(roomId, participantId, false);
  }

  private async assertCanModerate(roomId: string, userId: string): Promise<void> {
    const role = await this.memberships.getRole(roomId, userId);
    if (role !== 'owner' && role !== 'moderator') {
      throw new ForbiddenException('Only owners and moderators can manage room settings.');
    }
  }
}
