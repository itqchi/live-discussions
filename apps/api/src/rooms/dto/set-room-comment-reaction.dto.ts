import type { RoomReactionEmoji } from '@live-discussions/contracts';
import { IsBoolean, IsIn } from 'class-validator';
import { ROOM_REACTION_EMOJIS } from '../room-reactions';

export class SetRoomCommentReactionDto {
  @IsIn(ROOM_REACTION_EMOJIS)
  emoji!: RoomReactionEmoji;

  @IsBoolean()
  active!: boolean;
}
