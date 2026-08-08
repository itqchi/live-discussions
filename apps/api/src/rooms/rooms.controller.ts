import { Body, Controller, Delete, Get, Headers, Patch, Post } from '@nestjs/common';
import type {
  CreateRoomResponse,
  JoinRoomResponse,
  RoomParticipant,
  RoomSummary,
} from '@live-discussions/contracts';
import { devIdentityFromHeaders } from '../auth/dev-identity';
import { CreateRoomDto } from './dto/create-room.dto';
import { JoinRoomDto } from './dto/join-room.dto';
import { RaiseHandDto } from './dto/raise-hand.dto';
import { RemoveParticipantDto } from './dto/remove-participant.dto';
import { SetFeaturedParticipantDto } from './dto/set-featured-participant.dto';
import { UpdateParticipantRoleDto } from './dto/update-participant-role.dto';
import { RoomsService } from './rooms.service';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  list(): Promise<RoomSummary[]> {
    return this.roomsService.listRooms();
  }

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

  @Patch('featured-participant')
  async setFeaturedParticipant(
    @Body() request: SetFeaturedParticipantDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    await this.roomsService.setFeaturedParticipant(request, devIdentityFromHeaders(headers));
  }

  @Patch('participants/role')
  updateParticipantRole(
    @Body() request: UpdateParticipantRoleDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<RoomParticipant> {
    return this.roomsService.updateParticipantRole(request, devIdentityFromHeaders(headers));
  }

  @Delete('participants')
  async removeParticipant(
    @Body() request: RemoveParticipantDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    await this.roomsService.removeParticipant(request, devIdentityFromHeaders(headers));
  }
}
