import { Body, Controller, Post } from '@nestjs/common';
import type { JoinRoomRequest, JoinRoomResponse } from '@live-discussions/contracts';
import { RoomsService } from './rooms.service';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post('join')
  join(@Body() request: JoinRoomRequest): Promise<JoinRoomResponse> {
    return this.roomsService.createJoinToken(request);
  }
}
