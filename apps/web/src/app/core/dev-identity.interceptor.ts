import { type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { API_BASE_URL } from './api-base-url.token';
import { DevIdentityService } from './dev-identity.service';

export const devIdentityInterceptor: HttpInterceptorFn = (request, next) => {
  const apiBaseUrl = inject(API_BASE_URL).replace(/\/+$/, '');
  if (request.url !== apiBaseUrl && !request.url.startsWith(`${apiBaseUrl}/`)) {
    return next(request);
  }

  const identity = inject(DevIdentityService);
  const displayName = identity.displayName().trim();
  if (!displayName) return next(request);

  return next(
    request.clone({
      setHeaders: {
        'x-dev-user-id': identity.userId,
        'x-dev-display-name': displayName,
      },
    }),
  );
};
