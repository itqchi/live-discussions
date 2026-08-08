import type { Routes } from '@angular/router';

export const appRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadChildren: () =>
      import('./features/home/home.routes').then((module) => module.HOME_ROUTES),
  },
  {
    path: 'room',
    loadChildren: () =>
      import('./features/rooms/rooms.routes').then((module) => module.ROOMS_ROUTES),
  },
  {
    path: 'houses',
    loadChildren: () =>
      import('./features/houses/houses.routes').then((module) => module.HOUSES_ROUTES),
  },
  { path: '**', redirectTo: '' },
];
