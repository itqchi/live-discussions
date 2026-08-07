import { Body, Controller, Headers, Post } from '@nestjs/common';
import type { JoinRoomResponse } from '@live-discussions/contracts';
import { devIdentityFromHeaders } from '../auth/dev-identity';
import { JoinRoomDto } from './dto/join-room.dto';
import { RoomsService } from './rooms.service';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post('join')
  join(
    @Body() request: JoinRoomDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<JoinRoomResponse> {
    return this.roomsService.createJoinToken(request, devIdentityFromHeaders(headers));
  }
}
