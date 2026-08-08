import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RoomMembershipService } from './room-membership.service';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  imports: [DatabaseModule],
  controllers: [RoomsController],
  providers: [RoomsService, RoomMembershipService],
  exports: [RoomsService, RoomMembershipService],
})
export class RoomsModule {}
