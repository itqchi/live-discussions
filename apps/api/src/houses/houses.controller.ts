import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import type {
  AuthenticatedUser,
  CreateHouseResponse,
  CreateRoomResponse,
  GetHouseResponse,
  HouseMember,
  HouseSummary,
  JoinHouseResponse,
} from '@live-discussions/contracts';
import { DevUser } from '../auth/dev-user.decorator';
import { CreateHouseDto } from './dto/create-house.dto';
import { CreateHouseRoomDto } from './dto/create-house-room.dto';
import { JoinHouseDto } from './dto/join-house.dto';
import { UpdateHouseMemberRoleDto } from './dto/update-house-member-role.dto';
import { HousesService } from './houses.service';

@Controller('houses')
export class HousesController {
  constructor(private readonly housesService: HousesService) {}

  @Get()
  list(): Promise<HouseSummary[]> {
    return this.housesService.listHouses();
  }

  @Get(':houseId')
  get(
    @Param('houseId') houseId: string,
    @DevUser() user: AuthenticatedUser,
  ): Promise<GetHouseResponse> {
    return this.housesService.getHouse(houseId, user);
  }

  @Post()
  create(
    @Body() request: CreateHouseDto,
    @DevUser() user: AuthenticatedUser,
  ): Promise<CreateHouseResponse> {
    return this.housesService.createHouse(request, user);
  }

  @Post('join')
  join(
    @Body() request: JoinHouseDto,
    @DevUser() user: AuthenticatedUser,
  ): Promise<JoinHouseResponse> {
    return this.housesService.joinHouse(request, user);
  }

  @Patch(':houseId/members/role')
  updateMemberRole(
    @Param('houseId') houseId: string,
    @Body() request: UpdateHouseMemberRoleDto,
    @DevUser() user: AuthenticatedUser,
  ): Promise<HouseMember> {
    return this.housesService.updateMemberRole(houseId, request.userId, request.role, user);
  }

  @Post(':houseId/rooms')
  createRoom(
    @Param('houseId') houseId: string,
    @Body() request: CreateHouseRoomDto,
    @DevUser() user: AuthenticatedUser,
  ): Promise<CreateRoomResponse> {
    return this.housesService.createRoom(houseId, request, user);
  }

  @Patch(':houseId/rooms/:roomId/close')
  async closeRoom(
    @Param('houseId') houseId: string,
    @Param('roomId') roomId: string,
    @DevUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.housesService.closeRoom(houseId, roomId, user);
  }
}
