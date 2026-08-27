import { HttpErrorResponse } from '@angular/common/http';
import { catchError, firstValueFrom, throwError, type Observable } from 'rxjs';

interface ApiErrorBody {
  message?: string | string[];
}

export function apiRequestToPromise<T>(request$: Observable<T>, fallbackMessage: string): Promise<T> {
  return firstValueFrom(
    request$.pipe(
      catchError((error: unknown) =>
        throwError(() => new Error(apiErrorMessage(error, fallbackMessage))),
      ),
    ),
  );
}

export function apiErrorMessage(error: unknown, fallbackMessage: string): string {
  if (!(error instanceof HttpErrorResponse)) {
    return error instanceof Error && error.message ? error.message : fallbackMessage;
  }

  const body = error.error as ApiErrorBody | null;
  const message = body?.message;

  if (Array.isArray(message)) return message.filter(Boolean).join(' ');
  if (typeof message === 'string' && message.trim()) return message.trim();
  return fallbackMessage;
}
