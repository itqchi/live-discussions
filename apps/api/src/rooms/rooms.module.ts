import { Module } from '@nestjs/common';
import { RoomCommentsService } from './room-comments.service';
import { RoomMembershipService } from './room-membership.service';
import { RoomSettingsService } from './room-settings.service';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  controllers: [RoomsController],
  providers: [RoomsService, RoomMembershipService, RoomCommentsService, RoomSettingsService],
  exports: [RoomsService, RoomMembershipService, RoomCommentsService, RoomSettingsService],
})
export class RoomsModule {}
