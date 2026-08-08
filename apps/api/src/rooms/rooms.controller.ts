import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import type {
  AuthenticatedUser,
  CreateRoomResponse,
  JoinRoomResponse,
  RoomParticipant,
  RoomSummary,
} from '@live-discussions/contracts';
import { DevUser } from '../auth/dev-user.decorator';
import { CreateRoomDto } from './dto/create-room.dto';
import { JoinRoomDto } from './dto/join-room.dto';
import { RaiseHandDto } from './dto/raise-hand.dto';
import { RemoveParticipantDto } from './dto/remove-participant.dto';
import { SetFeaturedParticipantDto } from './dto/set-featured-participant.dto';
import { SetStagePresenceDto } from './dto/set-stage-presence.dto';
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
    @DevUser() user: AuthenticatedUser,
  ): Promise<CreateRoomResponse> {
    return this.roomsService.createRoom(request, user);
  }

  @Post('join')
  join(
    @Body() request: JoinRoomDto,
    @DevUser() user: AuthenticatedUser,
  ): Promise<JoinRoomResponse> {
    return this.roomsService.createJoinToken(request, user);
  }

  @Patch('hand')
  async setRaisedHand(
    @Body() request: RaiseHandDto,
    @DevUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.roomsService.setRaisedHand(request, user);
  }

  @Patch('stage-presence')
  async setStagePresence(
    @Body() request: SetStagePresenceDto,
    @DevUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.roomsService.setStagePresence(request, user);
  }

  @Patch('featured-participant')
  async setFeaturedParticipant(
    @Body() request: SetFeaturedParticipantDto,
    @DevUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.roomsService.setFeaturedParticipant(request, user);
  }

  @Patch('participants/role')
  updateParticipantRole(
    @Body() request: UpdateParticipantRoleDto,
    @DevUser() user: AuthenticatedUser,
  ): Promise<RoomParticipant> {
    return this.roomsService.updateParticipantRole(request, user);
  }

  @Delete('participants')
  async removeParticipant(
    @Body() request: RemoveParticipantDto,
    @DevUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.roomsService.removeParticipant(request, user);
  }

  @Delete(':roomId')
  async closeRoom(
    @Param('roomId') roomId: string,
    @DevUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.roomsService.closeRoom({ roomId }, user);
  }
}
