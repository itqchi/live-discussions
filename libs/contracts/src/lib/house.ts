export type HouseMemberRole = 'owner' | 'member';

export interface HouseSummary {
  id: string;
  name: string;
  description: string;
  memberCount: number;
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
