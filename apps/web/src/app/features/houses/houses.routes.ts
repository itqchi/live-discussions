import type { Routes } from '@angular/router';
import { RoomApiService } from '../rooms/data-access/room-api.service';
import { HouseApiService } from './data-access/house-api.service';
import { HouseFacade } from './data-access/house.facade';

export const HOUSES_ROUTES: Routes = [
  {
    path: ':houseId',
    providers: [HouseApiService, RoomApiService, HouseFacade],
    loadComponent: () =>
      import('./pages/house-page/house-page.component').then(
        (module) => module.HousePageComponent,
      ),
  },
];
