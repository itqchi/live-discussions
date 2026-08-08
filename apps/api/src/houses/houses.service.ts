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
import { RoomMembershipService } from '../rooms/room-membership.service';
import { RoomsService } from '../rooms/rooms.service';

interface HouseRecord {
  id: string;
  name: string;
  description: string;
  members: Map<string, HouseMemberRole>;
  roomIds: string[];
}

@Injectable()
export class HousesService {
  private readonly houses = new Map<string, HouseRecord>();

  constructor(
    private readonly roomsService: RoomsService,
    private readonly roomMemberships: RoomMembershipService,
  ) {}

  listHouses(): HouseSummary[] {
    return [...this.houses.values()]
      .map((house) => this.toSummary(house))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async getHouse(houseId: string, user: AuthenticatedUser): Promise<GetHouseResponse> {
    const house = this.getHouseRecord(houseId);
    const rooms = await Promise.all(house.roomIds.map((roomId) => this.roomMemberships.getRoomSummary(roomId)));

    const detail: HouseDetail = {
      ...this.toSummary(house),
      rooms,
    };

    return {
      house: detail,
      role: house.members.get(user.userId) ?? null,
    };
  }

  createHouse(request: CreateHouseRequest, owner: AuthenticatedUser): CreateHouseResponse {
    const house: HouseRecord = {
      id: randomUUID(),
      name: request.name,
      description: request.description,
      members: new Map([[owner.userId, 'owner']]),
      roomIds: [],
    };

    this.houses.set(house.id, house);

    return {
      house: this.toSummary(house),
      role: 'owner',
    };
  }

  joinHouse(request: JoinHouseRequest, user: AuthenticatedUser): JoinHouseResponse {
    const house = this.getHouseRecord(request.houseId);
    const existingRole = house.members.get(user.userId);
    const role: HouseMemberRole = existingRole ?? 'member';
    house.members.set(user.userId, role);

    return {
      house: this.toSummary(house),
      role,
    };
  }

  async createRoom(
    houseId: string,
    request: CreateHouseRoomRequest,
    user: AuthenticatedUser,
  ): Promise<CreateRoomResponse> {
    const house = this.getHouseRecord(houseId);
    if (house.members.get(user.userId) !== 'owner') {
      throw new ForbiddenException('Only the House owner can create rooms in this House.');
    }

    const response = await this.roomsService.createRoom(request, user);
    house.roomIds.push(request.roomId);
    return response;
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
}
