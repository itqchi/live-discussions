import { Module } from '@nestjs/common';
import { RoomMembershipService } from './room-membership.service';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  controllers: [RoomsController],
  providers: [RoomsService, RoomMembershipService],
  exports: [RoomsService, RoomMembershipService],
})
export class RoomsModule {}
