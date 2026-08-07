import type { Routes } from '@angular/router';

export const appRoutes: Routes = [
  {
    path: '',
    loadChildren: () =>
      import('./features/rooms/rooms.routes').then((module) => module.ROOMS_ROUTES),
  },
  { path: '**', redirectTo: '' },
];
