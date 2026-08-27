import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class BrowserStorageService {
  getLocal(key: string): string | null {
    return this.read(() => localStorage.getItem(key));
  }

  setLocal(key: string, value: string): void {
    this.write(() => localStorage.setItem(key, value));
  }

  removeLocal(key: string): void {
    this.write(() => localStorage.removeItem(key));
  }

  getSession(key: string): string | null {
    return this.read(() => sessionStorage.getItem(key));
  }

  removeSession(key: string): void {
    this.write(() => sessionStorage.removeItem(key));
  }

  private read(operation: () => string | null): string | null {
    try {
      return operation();
    } catch {
      return null;
    }
  }

  private write(operation: () => void): void {
    try {
      operation();
    } catch {
      // Persistence is a convenience. The in-memory application state remains authoritative for this tab.
    }
  }
}
