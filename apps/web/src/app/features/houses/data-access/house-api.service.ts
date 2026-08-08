import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  CreateHouseRequest,
  CreateHouseResponse,
  CreateHouseRoomRequest,
  CreateRoomResponse,
  GetHouseResponse,
  HouseMember,
  HouseSummary,
  JoinHouseRequest,
  JoinHouseResponse,
  UpdateHouseMemberRoleRequest,
} from '@live-discussions/contracts';
import { API_BASE_URL } from '../../../core/api-base-url.token';
import { apiRequestToPromise } from '../../../core/api-request.util';

@Injectable()
export class HouseApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  listHouses(): Promise<HouseSummary[]> {
    return apiRequestToPromise(
      this.http.get<HouseSummary[]>(`${this.apiBaseUrl}/houses`),
      'Unable to load houses.',
    );
  }

  getHouse(houseId: string): Promise<GetHouseResponse> {
    return apiRequestToPromise(
      this.http.get<GetHouseResponse>(`${this.apiBaseUrl}/houses/${encodeURIComponent(houseId)}`),
      'Unable to load the House.',
    );
  }

  createHouse(request: CreateHouseRequest): Promise<CreateHouseResponse> {
    return apiRequestToPromise(
      this.http.post<CreateHouseResponse>(`${this.apiBaseUrl}/houses`, request),
      'Unable to create the house.',
    );
  }

  joinHouse(request: JoinHouseRequest): Promise<JoinHouseResponse> {
    return apiRequestToPromise(
      this.http.post<JoinHouseResponse>(`${this.apiBaseUrl}/houses/join`, request),
      'Unable to join the house.',
    );
  }

  updateMemberRole(
    houseId: string,
    request: Omit<UpdateHouseMemberRoleRequest, 'houseId'>,
  ): Promise<HouseMember> {
    return apiRequestToPromise(
      this.http.patch<HouseMember>(
        `${this.apiBaseUrl}/houses/${encodeURIComponent(houseId)}/members/role`,
        request,
      ),
      'Unable to update the House member role.',
    );
  }

  createRoom(houseId: string, request: CreateHouseRoomRequest): Promise<CreateRoomResponse> {
    return apiRequestToPromise(
      this.http.post<CreateRoomResponse>(
        `${this.apiBaseUrl}/houses/${encodeURIComponent(houseId)}/rooms`,
        request,
      ),
      'Unable to create the room in this House.',
    );
  }

  closeRoom(houseId: string, roomId: string): Promise<void> {
    return apiRequestToPromise(
      this.http.delete<void>(
        `${this.apiBaseUrl}/houses/${encodeURIComponent(houseId)}/rooms/${encodeURIComponent(roomId)}`,
      ),
      'Unable to close the room.',
    );
  }
}
