import type { RoomSummary } from './room';

export type HouseMemberRole = 'owner' | 'admin' | 'member';

export interface HouseMember {
  userId: string;
  displayName: string;
  role: HouseMemberRole;
}

export interface HouseSummary {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  roomCount: number;
  roomIds: string[];
}

export interface HouseDetail extends HouseSummary {
  rooms: RoomSummary[];
  members: HouseMember[];
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

export interface UpdateHouseMemberRoleRequest {
  houseId: string;
  userId: string;
  role: Extract<HouseMemberRole, 'admin' | 'member'>;
}
