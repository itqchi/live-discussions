import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  AuthenticatedUser,
  CreateHouseRequest,
  CreateHouseResponse,
  HouseMemberRole,
  HouseSummary,
  JoinHouseRequest,
  JoinHouseResponse,
} from '@live-discussions/contracts';
import { randomUUID } from 'node:crypto';

interface HouseRecord {
  id: string;
  name: string;
  description: string;
  members: Map<string, HouseMemberRole>;
}

@Injectable()
export class HousesService {
  private readonly houses = new Map<string, HouseRecord>();

  listHouses(): HouseSummary[] {
    return [...this.houses.values()]
      .map((house) => this.toSummary(house))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  createHouse(request: CreateHouseRequest, owner: AuthenticatedUser): CreateHouseResponse {
    const house: HouseRecord = {
      id: randomUUID(),
      name: request.name,
      description: request.description,
      members: new Map([[owner.userId, 'owner']]),
    };

    this.houses.set(house.id, house);

    return {
      house: this.toSummary(house),
      role: 'owner',
    };
  }

  joinHouse(request: JoinHouseRequest, user: AuthenticatedUser): JoinHouseResponse {
    const house = this.houses.get(request.houseId);
    if (!house) throw new NotFoundException('House not found.');

    const existingRole = house.members.get(user.userId);
    const role: HouseMemberRole = existingRole ?? 'member';
    house.members.set(user.userId, role);

    return {
      house: this.toSummary(house),
      role,
    };
  }

  private toSummary(house: HouseRecord): HouseSummary {
    return {
      id: house.id,
      name: house.name,
      description: house.description,
      memberCount: house.members.size,
    };
  }
}
