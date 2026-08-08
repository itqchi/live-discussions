import type { Routes } from '@angular/router';
import { HouseApiService } from '../houses/data-access/house-api.service';
import { RoomApiService } from '../rooms/data-access/room-api.service';
import { HomeFacade } from './data-access/home.facade';

export const HOME_ROUTES: Routes = [
  {
    path: '',
    providers: [RoomApiService, HouseApiService, HomeFacade],
    loadComponent: () =>
      import('./pages/home-page/home-page.component').then(
        (module) => module.HomePageComponent,
      ),
  },
];
