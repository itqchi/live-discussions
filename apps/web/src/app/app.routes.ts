import type { Routes } from '@angular/router';

export const appRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/rooms/pages/room-page/room-page.component').then(
        (module) => module.RoomPageComponent,
      ),
  },
  { path: '**', redirectTo: '' },
];
