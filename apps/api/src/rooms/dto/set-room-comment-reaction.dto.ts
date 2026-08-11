import { ROOM_REACTION_EMOJIS, type RoomReactionEmoji } from '@live-discussions/contracts';
import { IsBoolean, IsIn } from 'class-validator';

export class SetRoomCommentReactionDto {
  @IsIn(ROOM_REACTION_EMOJIS)
  emoji!: RoomReactionEmoji;

  @IsBoolean()
  active!: boolean;
}
