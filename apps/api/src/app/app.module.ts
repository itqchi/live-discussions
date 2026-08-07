import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RoomMembershipService } from '../rooms/room-membership.service';
import { RoomsController } from '../rooms/rooms.controller';
import { RoomsService } from '../rooms/rooms.service';

@Module({
  imports: [DatabaseModule],
  controllers: [RoomsController],
  providers: [RoomsService, RoomMembershipService],
})
export class AppModule {}
