import { IsBoolean } from 'class-validator';

export class SetRoomCommentPinnedDto {
  @IsBoolean()
  pinned!: boolean;
}
