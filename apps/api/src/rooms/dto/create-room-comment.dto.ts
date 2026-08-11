import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateRoomCommentDto {
  @IsString()
  @Length(1, 160)
  id!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 1000)
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  replyToId!: string | null;
}
