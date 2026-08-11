import { Module } from '@nestjs/common';
import { RoomCommentsService } from './room-comments.service';
import { RoomMembershipService } from './room-membership.service';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  controllers: [RoomsController],
  providers: [RoomsService, RoomMembershipService, RoomCommentsService],
  exports: [RoomsService, RoomMembershipService, RoomCommentsService],
})
export class RoomsModule {}
