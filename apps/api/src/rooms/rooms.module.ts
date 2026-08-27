import { Module } from '@nestjs/common';
import { RoomCommentsService } from './room-comments.service';
import { RoomLifecycleService } from './room-lifecycle.service';
import { RoomMembershipService } from './room-membership.service';
import { RoomModerationService } from './room-moderation.service';
import { RoomSettingsService } from './room-settings.service';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  controllers: [RoomsController],
  providers: [
    RoomMembershipService,
    RoomCommentsService,
    RoomModerationService,
    RoomLifecycleService,
    RoomsService,
    RoomSettingsService,
  ],
  exports: [
    RoomsService,
    RoomMembershipService,
    RoomCommentsService,
    RoomSettingsService,
    RoomModerationService,
    RoomLifecycleService,
  ],
})
export class RoomsModule {}
