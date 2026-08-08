import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RoomsModule } from '../rooms/rooms.module';
import { HousesController } from './houses.controller';
import { HousesService } from './houses.service';

@Module({
  imports: [DatabaseModule, RoomsModule],
  controllers: [HousesController],
  providers: [HousesService],
})
export class HousesModule {}
