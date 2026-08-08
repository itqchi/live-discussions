import { InjectionToken } from '@angular/core';

declare global {
  interface Window {
    __LIVE_DISCUSSIONS_CONFIG__?: {
      apiBaseUrl?: string;
    };
  }
}

const LOCAL_API_BASE_URL = 'http://localhost:3000';

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => {
    const configured = typeof window === 'undefined'
      ? undefined
      : window.__LIVE_DISCUSSIONS_CONFIG__?.apiBaseUrl?.trim();

    return (configured || LOCAL_API_BASE_URL).replace(/\/+$/, '');
  },
});
