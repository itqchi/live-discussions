import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
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
import { catchError, firstValueFrom, throwError, type Observable } from 'rxjs';
import { API_BASE_URL } from '../../../core/api-base-url.token';

interface ApiErrorBody {
  message?: string | string[];
}

@Injectable()
export class RoomApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  listRooms(): Promise<RoomSummary[]> {
    return this.toPromise(
      this.http.get<RoomSummary[]>(`${this.apiBaseUrl}/rooms`),
      'Unable to load rooms.',
    );
  }

  createRoom(
    request: CreateRoomRequest,
    devUserId: string,
    displayName: string,
  ): Promise<CreateRoomResponse> {
    return this.toPromise(
      this.http.post<CreateRoomResponse>(`${this.apiBaseUrl}/rooms`, request, {
        headers: this.devHeaders(devUserId, displayName),
      }),
      'Unable to create the room.',
    );
  }

  joinRoom(
    request: JoinRoomRequest,
    devUserId: string,
    displayName: string,
  ): Promise<JoinRoomResponse> {
    return this.toPromise(
      this.http.post<JoinRoomResponse>(`${this.apiBaseUrl}/rooms/join`, request, {
        headers: this.devHeaders(devUserId, displayName),
      }),
      'Unable to join the room.',
    );
  }

  closeRoom(
    request: CloseRoomRequest,
    devUserId: string,
    displayName: string,
  ): Promise<void> {
    return this.toPromise(
      this.http.patch<void>(`${this.apiBaseUrl}/rooms/close`, request, {
        headers: this.devHeaders(devUserId, displayName),
      }),
      'Unable to close the room.',
    );
  }

  setRaisedHand(
    request: RaiseHandRequest,
    devUserId: string,
    displayName: string,
  ): Promise<void> {
    return this.toPromise(
      this.http.patch<void>(`${this.apiBaseUrl}/rooms/hand`, request, {
        headers: this.devHeaders(devUserId, displayName),
      }),
      'Unable to update your hand state.',
    );
  }

  setStagePresence(
    request: SetStagePresenceRequest,
    devUserId: string,
    displayName: string,
  ): Promise<void> {
    return this.toPromise(
      this.http.patch<void>(`${this.apiBaseUrl}/rooms/stage-presence`, request, {
        headers: this.devHeaders(devUserId, displayName),
      }),
      'Unable to update your stage position.',
    );
  }

  setFeaturedParticipant(
    request: SetFeaturedParticipantRequest,
    devUserId: string,
    displayName: string,
  ): Promise<void> {
    return this.toPromise(
      this.http.patch<void>(`${this.apiBaseUrl}/rooms/featured-participant`, request, {
        headers: this.devHeaders(devUserId, displayName),
      }),
      'Unable to feature this participant.',
    );
  }

  updateParticipantRole(
    request: UpdateParticipantRoleRequest,
    devUserId: string,
    displayName: string,
  ): Promise<RoomParticipant> {
    return this.toPromise(
      this.http.patch<RoomParticipant>(`${this.apiBaseUrl}/rooms/participants/role`, request, {
        headers: this.devHeaders(devUserId, displayName),
      }),
      'Unable to update participant role.',
    );
  }

  removeParticipant(
    request: RemoveParticipantRequest,
    devUserId: string,
    displayName: string,
  ): Promise<void> {
    return this.toPromise(
      this.http.delete<void>(`${this.apiBaseUrl}/rooms/participants`, {
        headers: this.devHeaders(devUserId, displayName),
        body: request,
      }),
      'Unable to remove participant from the room.',
    );
  }

  private devHeaders(devUserId: string, displayName: string): HttpHeaders {
    return new HttpHeaders({
      'x-dev-user-id': devUserId,
      'x-dev-display-name': displayName,
    });
  }

  private toPromise<T>(request$: Observable<T>, fallbackMessage: string): Promise<T> {
    return firstValueFrom(
      request$.pipe(
        catchError((error: HttpErrorResponse) =>
          throwError(() => new Error(this.getErrorMessage(error, fallbackMessage))),
        ),
      ),
    );
  }

  private getErrorMessage(error: HttpErrorResponse, fallbackMessage: string): string {
    const body = error.error as ApiErrorBody | null;
    const message = body?.message;

    if (Array.isArray(message)) return message.join(' ');
    if (typeof message === 'string' && message.trim()) return message;
    return fallbackMessage;
  }
}
