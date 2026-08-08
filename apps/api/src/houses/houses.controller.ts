import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import type {
  CreateHouseResponse,
  CreateRoomResponse,
  GetHouseResponse,
  HouseMember,
  HouseSummary,
  JoinHouseResponse,
} from '@live-discussions/contracts';
import { devIdentityFromHeaders } from '../auth/dev-identity';
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
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<GetHouseResponse> {
    return this.housesService.getHouse(houseId, devIdentityFromHeaders(headers));
  }

  @Post()
  create(
    @Body() request: CreateHouseDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<CreateHouseResponse> {
    return this.housesService.createHouse(request, devIdentityFromHeaders(headers));
  }

  @Post('join')
  join(
    @Body() request: JoinHouseDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<JoinHouseResponse> {
    return this.housesService.joinHouse(request, devIdentityFromHeaders(headers));
  }

  @Patch(':houseId/members/role')
  updateMemberRole(
    @Param('houseId') houseId: string,
    @Body() request: UpdateHouseMemberRoleDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<HouseMember> {
    return this.housesService.updateMemberRole(
      houseId,
      request.userId,
      request.role,
      devIdentityFromHeaders(headers),
    );
  }

  @Post(':houseId/rooms')
  createRoom(
    @Param('houseId') houseId: string,
    @Body() request: CreateHouseRoomDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<CreateRoomResponse> {
    return this.housesService.createRoom(houseId, request, devIdentityFromHeaders(headers));
  }
}
