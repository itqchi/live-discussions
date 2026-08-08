import type { Routes } from '@angular/router';

export const appRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadChildren: () =>
      import('./features/home/home.routes').then((module) => module.HOME_ROUTES),
  },
  {
    path: 'rooms',
    loadChildren: () =>
      import('./features/rooms/rooms.routes').then((module) => module.ROOMS_ROUTES),
  },
  { path: '**', redirectTo: '' },
];
