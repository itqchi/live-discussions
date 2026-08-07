import { Module } from '@nestjs/common';
import { RoomMembershipService } from '../rooms/room-membership.service';
import { RoomsController } from '../rooms/rooms.controller';
import { RoomsService } from '../rooms/rooms.service';

@Module({
  controllers: [RoomsController],
  providers: [RoomsService, RoomMembershipService],
})
export class AppModule {}
