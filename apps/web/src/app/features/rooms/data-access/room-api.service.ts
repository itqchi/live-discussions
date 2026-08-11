import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  CloseRoomRequest,
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  RaiseHandRequest,
  RemoveParticipantRequest,
  RoomParticipant,
  RoomSummary,
  SetFeaturedParticipantRequest,
  SetStagePresenceRequest,
  UpdateParticipantRoleRequest,
} from '@live-discussions/contracts';
import { API_BASE_URL } from '../../../core/api-base-url.token';
import { apiRequestToPromise } from '../../../core/api-request.util';

@Injectable()
export class RoomApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  listRooms(): Promise<RoomSummary[]> {
    return apiRequestToPromise(
      this.http.get<RoomSummary[]>(`${this.apiBaseUrl}/rooms`),
      'Unable to load rooms.',
    );
  }

  createRoom(request: CreateRoomRequest): Promise<CreateRoomResponse> {
    return apiRequestToPromise(
      this.http.post<CreateRoomResponse>(`${this.apiBaseUrl}/rooms`, request),
      'Unable to create the room.',
    );
  }

  joinRoom(request: JoinRoomRequest): Promise<JoinRoomResponse> {
    return apiRequestToPromise(
      this.http.post<JoinRoomResponse>(`${this.apiBaseUrl}/rooms/join`, request),
      'Unable to join the room.',
    );
  }

  closeRoom(request: CloseRoomRequest): Promise<void> {
    return apiRequestToPromise(
      this.http.delete<void>(`${this.apiBaseUrl}/rooms/${encodeURIComponent(request.roomId)}`),
      'Unable to close the room.',
    );
  }

  setRaisedHand(request: RaiseHandRequest): Promise<void> {
    return apiRequestToPromise(
      this.http.patch<void>(`${this.apiBaseUrl}/rooms/hand`, request),
      'Unable to update your hand state.',
    );
  }

  setStagePresence(request: SetStagePresenceRequest): Promise<void> {
    return apiRequestToPromise(
      this.http.patch<void>(`${this.apiBaseUrl}/rooms/stage-presence`, request),
      'Unable to update your stage position.',
    );
  }

  setFeaturedParticipant(request: SetFeaturedParticipantRequest): Promise<void> {
    return apiRequestToPromise(
      this.http.patch<void>(`${this.apiBaseUrl}/rooms/featured-participant`, request),
      'Unable to feature this participant.',
    );
  }

  updateParticipantRole(request: UpdateParticipantRoleRequest): Promise<RoomParticipant> {
    return apiRequestToPromise(
      this.http.patch<RoomParticipant>(`${this.apiBaseUrl}/rooms/participants/role`, request),
      'Unable to update participant role.',
    );
  }

  removeParticipant(request: RemoveParticipantRequest): Promise<void> {
    const roomId = encodeURIComponent(request.roomId);
    const participantId = encodeURIComponent(request.participantId);
    return apiRequestToPromise(
      this.http.delete<void>(`${this.apiBaseUrl}/rooms/${roomId}/participants/${participantId}`),
      'Unable to remove participant from the room.',
    );
  }
}
