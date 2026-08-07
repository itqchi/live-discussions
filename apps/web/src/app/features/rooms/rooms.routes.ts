import type { Routes } from '@angular/router';
import { RoomApiService } from './data-access/room-api.service';
import { RoomFacade } from './data-access/room.facade';
import { RoomMediaService } from './data-access/room-media.service';

export const ROOMS_ROUTES: Routes = [
  {
    path: '',
    providers: [RoomApiService, RoomMediaService, RoomFacade],
    loadComponent: () =>
      import('./pages/room-page/room-page.component').then(
        (module) => module.RoomPageComponent,
      ),
  },
];
