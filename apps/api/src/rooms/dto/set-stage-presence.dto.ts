import { Transform } from 'class-transformer';
import { IsBoolean, IsString, Length } from 'class-validator';

export class SetStagePresenceDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 80)
  roomId!: string;

  @IsBoolean()
  onStage!: boolean;
}
