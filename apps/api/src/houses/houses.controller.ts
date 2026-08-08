import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import type {
  CreateHouseResponse,
  HouseSummary,
  JoinHouseResponse,
} from '@live-discussions/contracts';
import { devIdentityFromHeaders } from '../auth/dev-identity';
import { CreateHouseDto } from './dto/create-house.dto';
import { JoinHouseDto } from './dto/join-house.dto';
import { HousesService } from './houses.service';

@Controller('houses')
export class HousesController {
  constructor(private readonly housesService: HousesService) {}

  @Get()
  list(): HouseSummary[] {
    return this.housesService.listHouses();
  }

  @Post()
  create(
    @Body() request: CreateHouseDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): CreateHouseResponse {
    return this.housesService.createHouse(request, devIdentityFromHeaders(headers));
  }

  @Post('join')
  join(
    @Body() request: JoinHouseDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): JoinHouseResponse {
    return this.housesService.joinHouse(request, devIdentityFromHeaders(headers));
  }
}
