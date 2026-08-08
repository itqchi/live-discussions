import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class CreateRoomDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 80)
  roomId!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 120)
  title!: string;
}
