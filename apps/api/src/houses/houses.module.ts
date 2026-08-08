import { Module } from '@nestjs/common';
import { RoomsModule } from '../rooms/rooms.module';
import { HousesController } from './houses.controller';
import { HousesService } from './houses.service';

@Module({
  imports: [RoomsModule],
  controllers: [HousesController],
  providers: [HousesService],
})
export class HousesModule {}
