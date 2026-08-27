import { Transform } from 'class-transformer';
import { IsBoolean, IsString, Length } from 'class-validator';

export class UpdateRoomSettingsDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  title!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(0, 500)
  description!: string;

  @IsBoolean()
  isLocked!: boolean;
}
