import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  CloseRoomRequest,
  CreateRoomCommentRequest,
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  MuteParticipantRequest,
  RaiseHandRequest,
  RemoveParticipantRequest,
  RoomBannedUser,
  RoomCommentHistoryItem,
  RoomParticipant,
  RoomSummary,
  SetFeaturedParticipantRequest,
  SetRoomCommentPinnedRequest,
  SetRoomCommentReactionRequest,
  SetStagePresenceRequest,
  UpdateParticipantRoleRequest,
  UpdateRoomSettingsRequest,
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

  getRoom(roomId: string): Promise<RoomSummary> {
    return apiRequestToPromise(
      this.http.get<RoomSummary>(`${this.apiBaseUrl}/rooms/${encodeURIComponent(roomId)}`),
      'Unable to load room details.',
    );
  }

  updateRoomSettings(
    roomId: string,
    request: UpdateRoomSettingsRequest,
  ): Promise<RoomSummary> {
    return apiRequestToPromise(
      this.http.patch<RoomSummary>(
        `${this.apiBaseUrl}/rooms/${encodeURIComponent(roomId)}/settings`,
        request,
      ),
      'Unable to update room settings.',
    );
  }

  listBannedUsers(roomId: string): Promise<RoomBannedUser[]> {
    return apiRequestToPromise(
      this.http.get<RoomBannedUser[]>(
        `${this.apiBaseUrl}/rooms/${encodeURIComponent(roomId)}/bans`,
      ),
      'Unable to load banned participants.',
    );
  }

  banParticipant(roomId: string, participantId: string): Promise<void> {
    return apiRequestToPromise(
      this.http.patch<void>(
        `${this.apiBaseUrl}/rooms/${encodeURIComponent(roomId)}/bans/${encodeURIComponent(participantId)}`,
        {},
      ),
      'Unable to ban this participant.',
    );
  }

  unbanParticipant(roomId: string, participantId: string): Promise<void> {
    return apiRequestToPromise(
      this.http.delete<void>(
        `${this.apiBaseUrl}/rooms/${encodeURIComponent(roomId)}/bans/${encodeURIComponent(participantId)}`,
      ),
      'Unable to unban this participant.',
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

  listComments(roomId: string): Promise<RoomCommentHistoryItem[]> {
    return apiRequestToPromise(
      this.http.get<RoomCommentHistoryItem[]>(
        `${this.apiBaseUrl}/rooms/${encodeURIComponent(roomId)}/comments`,
      ),
      'Unable to load shared comment history.',
    );
  }

  createComment(
    roomId: string,
    request: CreateRoomCommentRequest,
  ): Promise<RoomCommentHistoryItem> {
    return apiRequestToPromise(
      this.http.post<RoomCommentHistoryItem>(
        `${this.apiBaseUrl}/rooms/${encodeURIComponent(roomId)}/comments`,
        request,
      ),
      'Unable to save this comment to shared history.',
    );
  }

  setCommentReaction(
    roomId: string,
    commentId: string,
    request: SetRoomCommentReactionRequest,
  ): Promise<void> {
    return apiRequestToPromise(
      this.http.patch<void>(
        `${this.apiBaseUrl}/rooms/${encodeURIComponent(roomId)}/comments/${encodeURIComponent(commentId)}/reaction`,
        request,
      ),
      'Unable to save this reaction to shared history.',
    );
  }

  setCommentPinned(
    roomId: string,
    commentId: string,
    request: SetRoomCommentPinnedRequest,
  ): Promise<void> {
    return apiRequestToPromise(
      this.http.patch<void>(
        `${this.apiBaseUrl}/rooms/${encodeURIComponent(roomId)}/comments/${encodeURIComponent(commentId)}/pinned`,
        request,
      ),
      'Unable to update the pinned comment.',
    );
  }

  muteParticipant(request: MuteParticipantRequest): Promise<void> {
    const roomId = encodeURIComponent(request.roomId);
    const participantId = encodeURIComponent(request.participantId);
    return apiRequestToPromise(
      this.http.patch<void>(
        `${this.apiBaseUrl}/rooms/${roomId}/participants/${participantId}/mute`,
        request.durationSeconds === null ? {} : { durationSeconds: request.durationSeconds },
      ),
      'Unable to mute this participant.',
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
