import { Body, Controller, Headers, Patch, Post } from '@nestjs/common';
import type { CreateRoomResponse, JoinRoomResponse, RoomParticipant } from '@live-discussions/contracts';
import { devIdentityFromHeaders } from '../auth/dev-identity';
import { CreateRoomDto } from './dto/create-room.dto';
import { JoinRoomDto } from './dto/join-room.dto';
import { RaiseHandDto } from './dto/raise-hand.dto';
import { UpdateParticipantRoleDto } from './dto/update-participant-role.dto';
import { RoomsService } from './rooms.service';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  create(
    @Body() request: CreateRoomDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<CreateRoomResponse> {
    return this.roomsService.createRoom(request, devIdentityFromHeaders(headers));
  }

  @Post('join')
  join(
    @Body() request: JoinRoomDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<JoinRoomResponse> {
    return this.roomsService.createJoinToken(request, devIdentityFromHeaders(headers));
  }

  @Patch('hand')
  async setRaisedHand(
    @Body() request: RaiseHandDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    await this.roomsService.setRaisedHand(request, devIdentityFromHeaders(headers));
  }

  @Patch('participants/role')
  updateParticipantRole(
    @Body() request: UpdateParticipantRoleDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<RoomParticipant> {
    return this.roomsService.updateParticipantRole(request, devIdentityFromHeaders(headers));
  }
}
