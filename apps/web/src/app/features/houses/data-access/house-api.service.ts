import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
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
import { catchError, firstValueFrom, throwError, type Observable } from 'rxjs';
import { API_BASE_URL } from '../../../core/api-base-url.token';

interface ApiErrorBody {
  message?: string | string[];
}

@Injectable()
export class HouseApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  listHouses(): Promise<HouseSummary[]> {
    return this.toPromise(
      this.http.get<HouseSummary[]>(`${this.apiBaseUrl}/houses`),
      'Unable to load houses.',
    );
  }

  getHouse(houseId: string, devUserId: string, displayName: string): Promise<GetHouseResponse> {
    return this.toPromise(
      this.http.get<GetHouseResponse>(`${this.apiBaseUrl}/houses/${houseId}`, {
        headers: this.devHeaders(devUserId, displayName),
      }),
      'Unable to load the House.',
    );
  }

  createHouse(
    request: CreateHouseRequest,
    devUserId: string,
    displayName: string,
  ): Promise<CreateHouseResponse> {
    return this.toPromise(
      this.http.post<CreateHouseResponse>(`${this.apiBaseUrl}/houses`, request, {
        headers: this.devHeaders(devUserId, displayName),
      }),
      'Unable to create the house.',
    );
  }

  joinHouse(
    request: JoinHouseRequest,
    devUserId: string,
    displayName: string,
  ): Promise<JoinHouseResponse> {
    return this.toPromise(
      this.http.post<JoinHouseResponse>(`${this.apiBaseUrl}/houses/join`, request, {
        headers: this.devHeaders(devUserId, displayName),
      }),
      'Unable to join the house.',
    );
  }

  updateMemberRole(
    houseId: string,
    request: Omit<UpdateHouseMemberRoleRequest, 'houseId'>,
    devUserId: string,
    displayName: string,
  ): Promise<HouseMember> {
    return this.toPromise(
      this.http.patch<HouseMember>(`${this.apiBaseUrl}/houses/${houseId}/members/role`, request, {
        headers: this.devHeaders(devUserId, displayName),
      }),
      'Unable to update the House member role.',
    );
  }

  createRoom(
    houseId: string,
    request: CreateHouseRoomRequest,
    devUserId: string,
    displayName: string,
  ): Promise<CreateRoomResponse> {
    return this.toPromise(
      this.http.post<CreateRoomResponse>(`${this.apiBaseUrl}/houses/${houseId}/rooms`, request, {
        headers: this.devHeaders(devUserId, displayName),
      }),
      'Unable to create the room in this House.',
    );
  }

  closeRoom(
    houseId: string,
    roomId: string,
    devUserId: string,
    displayName: string,
  ): Promise<void> {
    return this.toPromise(
      this.http.patch<void>(`${this.apiBaseUrl}/houses/${houseId}/rooms/${roomId}/close`, {}, {
        headers: this.devHeaders(devUserId, displayName),
      }),
      'Unable to close the room.',
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
