import type { RoomSummary } from './room';

export type HouseMemberRole = 'owner' | 'member';

export interface HouseSummary {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  roomCount: number;
}

export interface HouseDetail extends HouseSummary {
  rooms: RoomSummary[];
}

export interface CreateHouseRequest {
  name: string;
  description: string;
}

export interface CreateHouseResponse {
  house: HouseSummary;
  role: HouseMemberRole;
}

export interface JoinHouseRequest {
  houseId: string;
}

export interface JoinHouseResponse {
  house: HouseSummary;
  role: HouseMemberRole;
}

export interface GetHouseResponse {
  house: HouseDetail;
  role: HouseMemberRole | null;
}

export interface CreateHouseRoomRequest {
  roomId: string;
  title: string;
}
