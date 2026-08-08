import { InjectionToken } from '@angular/core';

declare global {
  interface Window {
    __LIVE_DISCUSSIONS_CONFIG__?: {
      apiBaseUrl?: string;
    };
  }
}

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => window.__LIVE_DISCUSSIONS_CONFIG__?.apiBaseUrl?.trim() || 'http://localhost:3000',
});
