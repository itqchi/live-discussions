import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { JoinRoomRequest, JoinRoomResponse } from '@live-discussions/contracts';
import { catchError, firstValueFrom, throwError } from 'rxjs';
import { API_BASE_URL } from '../../../core/api-base-url.token';

interface ApiErrorBody {
  message?: string | string[];
}

@Injectable()
export class RoomApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  joinRoom(
    request: JoinRoomRequest,
    devUserId: string,
    displayName: string,
  ): Promise<JoinRoomResponse> {
    const headers = new HttpHeaders({
      'x-dev-user-id': devUserId,
      'x-dev-display-name': displayName,
    });

    return firstValueFrom(
      this.http
        .post<JoinRoomResponse>(`${this.apiBaseUrl}/rooms/join`, request, { headers })
        .pipe(
          catchError((error: HttpErrorResponse) =>
            throwError(() => new Error(this.getErrorMessage(error))),
          ),
        ),
    );
  }

  private getErrorMessage(error: HttpErrorResponse): string {
    const body = error.error as ApiErrorBody | null;
    const message = body?.message;

    if (Array.isArray(message)) {
      return message.join(' ');
    }

    if (typeof message === 'string' && message.trim()) {
      return message;
    }

    return 'Unable to join the room.';
  }
}
