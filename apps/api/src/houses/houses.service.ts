import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AuthenticatedUser,
  CreateHouseRequest,
  CreateHouseResponse,
  CreateHouseRoomRequest,
  CreateRoomResponse,
  GetHouseResponse,
  HouseDetail,
  HouseMember,
  HouseMemberRole,
  HouseSummary,
  JoinHouseRequest,
  JoinHouseResponse,
  UpdateHouseRequest,
} from '@live-discussions/contracts';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { RoomMembershipService } from '../rooms/room-membership.service';
import { RoomsService } from '../rooms/rooms.service';

interface HouseRecord {
  id: string;
  name: string;
  description: string;
  members: Map<string, HouseMemberRole>;
  memberNames: Map<string, string>;
}

interface HouseSummaryRow {
  id: string;
  name: string;
  description: string;
  member_count: string;
}

@Injectable()
export class HousesService {
  private readonly houses = new Map<string, HouseRecord>();
  private readonly roomNameReservations = new Set<string>();

  constructor(
    private readonly database: DatabaseService,
    private readonly roomsService: RoomsService,
    private readonly roomMemberships: RoomMembershipService,
  ) {}

  async listHouses(): Promise<HouseSummary[]> {
    if (!this.database.configured) {
      const summaries = await Promise.all([...this.houses.values()].map((house) => this.toSummary(house)));
      return summaries.sort((a, b) => a.name.localeCompare(b.name));
    }

    const result = await this.database.query<HouseSummaryRow>(
      `SELECT house.id, house.name, house.description,
              COUNT(DISTINCT member.user_id)::text AS member_count
       FROM discussion_house house
       LEFT JOIN house_member member ON member.house_id = house.id
       GROUP BY house.id, house.name, house.description
       ORDER BY house.name ASC`,
    );

    return Promise.all(result.rows.map((row) => this.summaryFromRow(row)));
  }

  async getHouse(houseId: string, user: AuthenticatedUser | null): Promise<GetHouseResponse> {
    const house = await this.getHouseSummary(houseId);
    const rooms = await this.roomMemberships.listRoomsForHouse(houseId);
    const [role, members] = await Promise.all([
      user ? this.getMemberRole(houseId, user.userId) : Promise.resolve(null),
      this.getMembers(houseId),
    ]);

    const detail: HouseDetail = {
      ...house,
      roomIds: rooms.map((room) => room.id),
      roomCount: rooms.length,
      rooms,
      members,
    };
    return { house: detail, role };
  }

  async createHouse(
    request: CreateHouseRequest,
    owner: AuthenticatedUser,
  ): Promise<CreateHouseResponse> {
    const id = randomUUID();

    if (!this.database.configured) {
      const house: HouseRecord = {
        id,
        name: request.name,
        description: request.description,
        members: new Map([[owner.userId, 'owner']]),
        memberNames: new Map([[owner.userId, owner.displayName]]),
      };
      this.houses.set(id, house);
      return { house: await this.toSummary(house), role: 'owner' };
    }

    await this.database.transaction(async (client) => {
      await client.query(
        `INSERT INTO app_user (id, display_name)
         VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE
         SET display_name = EXCLUDED.display_name, updated_at = NOW()`,
        [owner.userId, owner.displayName],
      );
      await client.query(
        'INSERT INTO discussion_house (id, name, description) VALUES ($1, $2, $3)',
        [id, request.name, request.description],
      );
      await client.query(
        'INSERT INTO house_member (house_id, user_id, role) VALUES ($1, $2, $3)',
        [id, owner.userId, 'owner'],
      );
    });

    return {
      house: {
        id,
        name: request.name,
        description: request.description,
        memberCount: 1,
        roomCount: 0,
        roomIds: [],
      },
      role: 'owner',
    };
  }

  async updateHouse(
    houseId: string,
    request: UpdateHouseRequest,
    actor: AuthenticatedUser,
  ): Promise<HouseSummary> {
    await this.getHouseSummary(houseId);
    const role = await this.getMemberRole(houseId, actor.userId);
    if (role !== 'owner') {
      throw new ForbiddenException('Only the House owner can edit House settings.');
    }

    if (!this.database.configured) {
      const house = this.getHouseRecord(houseId);
      house.name = request.name;
      house.description = request.description;
      return this.toSummary(house);
    }

    const result = await this.database.query<{ id: string }>(
      `UPDATE discussion_house
       SET name = $2, description = $3
       WHERE id = $1
       RETURNING id`,
      [houseId, request.name, request.description],
    );
    if (!result.rows[0]) throw new NotFoundException('House not found.');
    return this.getHouseSummary(houseId);
  }

  async joinHouse(request: JoinHouseRequest, user: AuthenticatedUser): Promise<JoinHouseResponse> {
    if (!this.database.configured) {
      const house = this.getHouseRecord(request.houseId);
      const role: HouseMemberRole = house.members.get(user.userId) ?? 'member';
      house.members.set(user.userId, role);
      house.memberNames.set(user.userId, user.displayName);
      return { house: await this.toSummary(house), role };
    }

    const role = await this.database.transaction<HouseMemberRole>(async (client) => {
      const house = await client.query('SELECT id FROM discussion_house WHERE id = $1', [request.houseId]);
      if (!house.rows[0]) throw new NotFoundException('House not found.');

      await client.query(
        `INSERT INTO app_user (id, display_name)
         VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE
         SET display_name = EXCLUDED.display_name, updated_at = NOW()`,
        [user.userId, user.displayName],
      );

      await client.query(
        `INSERT INTO house_member (house_id, user_id, role)
         VALUES ($1, $2, 'member')
         ON CONFLICT (house_id, user_id) DO NOTHING`,
        [request.houseId, user.userId],
      );

      const membership = await client.query<{ role: HouseMemberRole }>(
        'SELECT role FROM house_member WHERE house_id = $1 AND user_id = $2',
        [request.houseId, user.userId],
      );
      const resolved = membership.rows[0];
      if (!resolved) throw new NotFoundException('House membership could not be resolved.');
      return resolved.role;
    });

    return { house: await this.getHouseSummary(request.houseId), role };
  }

  async updateMemberRole(
    houseId: string,
    targetUserId: string,
    role: Extract<HouseMemberRole, 'admin' | 'member'>,
    actor: AuthenticatedUser,
  ): Promise<HouseMember> {
    const actorRole = await this.getMemberRole(houseId, actor.userId);
    if (actorRole !== 'owner') {
      throw new ForbiddenException('Only the House owner can manage House admins.');
    }

    const targetRole = await this.getMemberRole(houseId, targetUserId);
    if (!targetRole) throw new NotFoundException('House member not found.');
    if (targetRole === 'owner') {
      throw new ForbiddenException('The House owner role cannot be changed here.');
    }

    let displayName = targetUserId;
    if (!this.database.configured) {
      const house = this.getHouseRecord(houseId);
      house.members.set(targetUserId, role);
      displayName = house.memberNames.get(targetUserId) ?? targetUserId;
    } else {
      const result = await this.database.query<{ display_name: string }>(
        `UPDATE house_member member
         SET role = $3
         FROM app_user app
         WHERE member.house_id = $1
           AND member.user_id = $2
           AND app.id = member.user_id
         RETURNING app.display_name`,
        [houseId, targetUserId, role],
      );
      if (!result.rows[0]) throw new NotFoundException('House member not found.');
      displayName = result.rows[0].display_name;
    }

    const rooms = await this.roomMemberships.listRoomsForHouse(houseId);
    const roomRole = role === 'admin' ? 'moderator' : 'listener';
    await Promise.all(
      rooms.map(async (room) => {
        await this.roomMemberships.ensureRole(room.id, targetUserId, roomRole, displayName);
        await this.roomsService.syncParticipantRoleIfConnected(room.id, targetUserId, roomRole);
      }),
    );

    return { userId: targetUserId, displayName, role };
  }

  async createRoom(
    houseId: string,
    request: CreateHouseRoomRequest,
    user: AuthenticatedUser,
  ): Promise<CreateRoomResponse> {
    const role = await this.getMemberRole(houseId, user.userId);
    if (role !== 'owner' && role !== 'admin') {
      throw new ForbiddenException('Only the House owner or an admin can create rooms in this House.');
    }

    const normalizedName = this.normalizeRoomName(request.title);
    const reservationKey = `${houseId}\u0000${normalizedName}`;
    if (this.roomNameReservations.has(reservationKey)) {
      throw new ConflictException('A room with this name is already being created in this House.');
    }
    this.roomNameReservations.add(reservationKey);

    try {
      await this.getHouseSummary(houseId);
      const rooms = await this.roomMemberships.listRoomsForHouse(houseId);
      if (rooms.some((room) => this.normalizeRoomName(room.title) === normalizedName)) {
        throw new ConflictException('A room with this name already exists in this House.');
      }

      const members = await this.getMembers(houseId);
      const houseOwner = members.find((member) => member.role === 'owner');
      if (!houseOwner) throw new NotFoundException('House owner not found.');

      const roomOwner: AuthenticatedUser = {
        userId: houseOwner.userId,
        displayName: houseOwner.displayName,
      };
      const response = await this.roomsService.createRoom(request, roomOwner, houseId);
      const roomId = response.room.id;

      try {
        await this.persistAdminsToRoom(houseId, roomId);
        return response;
      } catch (error) {
        try {
          await this.roomsService.closeRoom({ roomId }, roomOwner);
        } catch {
          // Preserve the original admin-inheritance failure.
        }
        throw error;
      }
    } finally {
      this.roomNameReservations.delete(reservationKey);
    }
  }

  async closeRoom(houseId: string, roomId: string, user: AuthenticatedUser): Promise<void> {
    const role = await this.getMemberRole(houseId, user.userId);
    if (role !== 'owner' && role !== 'admin') {
      throw new ForbiddenException('Only the House owner or an admin can close rooms.');
    }

    const roomHouseId = await this.roomMemberships.getHouseId(roomId);
    if (roomHouseId !== houseId) {
      throw new NotFoundException('Room does not belong to this House.');
    }

    await this.roomsService.closeRoom({ roomId }, user);
  }

  private async persistAdminsToRoom(houseId: string, roomId: string): Promise<void> {
    const admins = (await this.getMembers(houseId)).filter((member) => member.role === 'admin');
    await Promise.all(
      admins.map((admin) =>
        this.roomMemberships.ensureRole(roomId, admin.userId, 'moderator', admin.displayName),
      ),
    );
  }

  private async getMembers(houseId: string): Promise<HouseMember[]> {
    if (!this.database.configured) {
      const house = this.getHouseRecord(houseId);
      return [...house.members.entries()]
        .map(([userId, role]) => ({
          userId,
          displayName: house.memberNames.get(userId) ?? userId,
          role,
        }))
        .sort((a, b) => this.memberSort(a, b));
    }

    const result = await this.database.query<{
      user_id: string;
      display_name: string;
      role: HouseMemberRole;
    }>(
      `SELECT member.user_id, app.display_name, member.role
       FROM house_member member
       JOIN app_user app ON app.id = member.user_id
       WHERE member.house_id = $1
       ORDER BY CASE member.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
                app.display_name ASC`,
      [houseId],
    );

    return result.rows.map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      role: row.role,
    }));
  }

  private memberSort(left: HouseMember, right: HouseMember): number {
    const rank = (role: HouseMemberRole): number =>
      role === 'owner' ? 0 : role === 'admin' ? 1 : 2;
    return rank(left.role) - rank(right.role) || left.displayName.localeCompare(right.displayName);
  }

  private async getHouseSummary(houseId: string): Promise<HouseSummary> {
    if (!this.database.configured) return this.toSummary(this.getHouseRecord(houseId));

    const result = await this.database.query<HouseSummaryRow>(
      `SELECT house.id, house.name, house.description,
              COUNT(DISTINCT member.user_id)::text AS member_count
       FROM discussion_house house
       LEFT JOIN house_member member ON member.house_id = house.id
       WHERE house.id = $1
       GROUP BY house.id, house.name, house.description`,
      [houseId],
    );

    const row = result.rows[0];
    if (!row) throw new NotFoundException('House not found.');
    return this.summaryFromRow(row);
  }

  private async getMemberRole(houseId: string, userId: string): Promise<HouseMemberRole | null> {
    if (!this.database.configured) {
      return this.getHouseRecord(houseId).members.get(userId) ?? null;
    }

    const result = await this.database.query<{ role: HouseMemberRole }>(
      'SELECT role FROM house_member WHERE house_id = $1 AND user_id = $2',
      [houseId, userId],
    );
    return result.rows[0]?.role ?? null;
  }

  private normalizeRoomName(title: string): string {
    return title.trim().toLowerCase();
  }

  private getHouseRecord(houseId: string): HouseRecord {
    const house = this.houses.get(houseId);
    if (!house) throw new NotFoundException('House not found.');
    return house;
  }

  private async toSummary(house: HouseRecord): Promise<HouseSummary> {
    const rooms = await this.roomMemberships.listRoomsForHouse(house.id);
    return {
      id: house.id,
      name: house.name,
      description: house.description,
      memberCount: house.members.size,
      roomCount: rooms.length,
      roomIds: rooms.map((room) => room.id),
    };
  }

  private async summaryFromRow(row: HouseSummaryRow): Promise<HouseSummary> {
    const rooms = await this.roomMemberships.listRoomsForHouse(row.id);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      memberCount: Number(row.member_count),
      roomCount: rooms.length,
      roomIds: rooms.map((room) => room.id),
    };
  }
}
