import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  CreateHouseRequest,
  CreateHouseResponse,
  HouseSummary,
  JoinHouseRequest,
  JoinHouseResponse,
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
