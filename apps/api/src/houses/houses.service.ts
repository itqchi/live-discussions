import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AuthenticatedUser,
  CreateHouseRequest,
  CreateHouseResponse,
  CreateHouseRoomRequest,
  CreateRoomResponse,
  GetHouseResponse,
  HouseDetail,
  HouseMemberRole,
  HouseSummary,
  JoinHouseRequest,
  JoinHouseResponse,
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
  roomIds: string[];
}

interface HouseSummaryRow {
  id: string;
  name: string;
  description: string;
  member_count: string;
  room_count: string;
  room_ids: string[];
}

@Injectable()
export class HousesService {
  private readonly houses = new Map<string, HouseRecord>();

  constructor(
    private readonly database: DatabaseService,
    private readonly roomsService: RoomsService,
    private readonly roomMemberships: RoomMembershipService,
  ) {}

  async listHouses(): Promise<HouseSummary[]> {
    if (!this.database.configured) {
      return [...this.houses.values()]
        .map((house) => this.toSummary(house))
        .sort((left, right) => left.name.localeCompare(right.name));
    }

    const result = await this.database.query<HouseSummaryRow>(
      `SELECT
         house.id,
         house.name,
         house.description,
         COUNT(DISTINCT member.user_id)::text AS member_count,
         COUNT(DISTINCT house_room.room_id)::text AS room_count,
         COALESCE(
           ARRAY_AGG(DISTINCT house_room.room_id) FILTER (WHERE house_room.room_id IS NOT NULL),
           ARRAY[]::text[]
         ) AS room_ids
       FROM discussion_house house
       LEFT JOIN house_member member ON member.house_id = house.id
       LEFT JOIN house_room ON house_room.house_id = house.id
       GROUP BY house.id, house.name, house.description
       ORDER BY house.name ASC`,
    );

    return result.rows.map((row) => this.summaryFromRow(row));
  }

  async getHouse(houseId: string, user: AuthenticatedUser): Promise<GetHouseResponse> {
    const house = await this.getHouseSummary(houseId);
    const rooms = await Promise.all(house.roomIds.map((roomId) => this.roomMemberships.getRoomSummary(roomId)));
    const role = await this.getMemberRole(houseId, user.userId);

    const detail: HouseDetail = {
      ...house,
      rooms,
    };

    return { house: detail, role };
  }

  async createHouse(request: CreateHouseRequest, owner: AuthenticatedUser): Promise<CreateHouseResponse> {
    const id = randomUUID();

    if (!this.database.configured) {
      const house: HouseRecord = {
        id,
        name: request.name,
        description: request.description,
        members: new Map([[owner.userId, 'owner']]),
        roomIds: [],
      };

      this.houses.set(house.id, house);
      return { house: this.toSummary(house), role: 'owner' };
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

  async joinHouse(request: JoinHouseRequest, user: AuthenticatedUser): Promise<JoinHouseResponse> {
    if (!this.database.configured) {
      const house = this.getHouseRecord(request.houseId);
      const existingRole = house.members.get(user.userId);
      const role: HouseMemberRole = existingRole ?? 'member';
      house.members.set(user.userId, role);
      return { house: this.toSummary(house), role };
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

      const existing = await client.query<{ role: HouseMemberRole }>(
        'SELECT role FROM house_member WHERE house_id = $1 AND user_id = $2',
        [request.houseId, user.userId],
      );
      if (existing.rows[0]) return existing.rows[0].role;

      await client.query(
        'INSERT INTO house_member (house_id, user_id, role) VALUES ($1, $2, $3)',
        [request.houseId, user.userId, 'member'],
      );
      return 'member';
    });

    return {
      house: await this.getHouseSummary(request.houseId),
      role,
    };
  }

  async createRoom(
    houseId: string,
    request: CreateHouseRoomRequest,
    user: AuthenticatedUser,
  ): Promise<CreateRoomResponse> {
    const role = await this.getMemberRole(houseId, user.userId);
    if (role !== 'owner') {
      throw new ForbiddenException('Only the House owner can create rooms in this House.');
    }

    const response = await this.roomsService.createRoom(request, user);

    if (!this.database.configured) {
      this.getHouseRecord(houseId).roomIds.push(request.roomId);
      return response;
    }

    await this.database.query(
      'INSERT INTO house_room (house_id, room_id) VALUES ($1, $2)',
      [houseId, request.roomId],
    );
    return response;
  }

  private async getHouseSummary(houseId: string): Promise<HouseSummary> {
    if (!this.database.configured) return this.toSummary(this.getHouseRecord(houseId));

    const result = await this.database.query<HouseSummaryRow>(
      `SELECT
         house.id,
         house.name,
         house.description,
         COUNT(DISTINCT member.user_id)::text AS member_count,
         COUNT(DISTINCT house_room.room_id)::text AS room_count,
         COALESCE(
           ARRAY_AGG(DISTINCT house_room.room_id) FILTER (WHERE house_room.room_id IS NOT NULL),
           ARRAY[]::text[]
         ) AS room_ids
       FROM discussion_house house
       LEFT JOIN house_member member ON member.house_id = house.id
       LEFT JOIN house_room ON house_room.house_id = house.id
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

  private getHouseRecord(houseId: string): HouseRecord {
    const house = this.houses.get(houseId);
    if (!house) throw new NotFoundException('House not found.');
    return house;
  }

  private toSummary(house: HouseRecord): HouseSummary {
    return {
      id: house.id,
      name: house.name,
      description: house.description,
      memberCount: house.members.size,
      roomCount: house.roomIds.length,
      roomIds: [...house.roomIds],
    };
  }

  private summaryFromRow(row: HouseSummaryRow): HouseSummary {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      memberCount: Number(row.member_count),
      roomCount: Number(row.room_count),
      roomIds: row.room_ids,
    };
  }
}
