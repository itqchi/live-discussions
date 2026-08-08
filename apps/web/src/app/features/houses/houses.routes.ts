import type { Routes } from '@angular/router';
import { HouseApiService } from './data-access/house-api.service';
import { HouseFacade } from './data-access/house.facade';

export const HOUSES_ROUTES: Routes = [
  {
    path: ':houseId',
    providers: [HouseApiService, HouseFacade],
    loadComponent: () =>
      import('./pages/house-page/house-page.component').then(
        (module) => module.HousePageComponent,
      ),
  },
];
