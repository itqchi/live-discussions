import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { JoinRoomRequest, JoinRoomResponse } from '@live-discussions/contracts';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../core/api-base-url.token';

@Injectable({ providedIn: 'root' })
export class RoomApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  joinRoom(request: JoinRoomRequest, devUserId: string, displayName: string): Promise<JoinRoomResponse> {
    const headers = new HttpHeaders({
      'x-dev-user-id': devUserId,
      'x-dev-display-name': displayName,
    });

    return firstValueFrom(
      this.http.post<JoinRoomResponse>(`${this.apiBaseUrl}/rooms/join`, request, { headers }),
    );
  }
}
