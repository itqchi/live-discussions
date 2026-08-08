import { IsBoolean, IsString, Length } from 'class-validator';

export class RaiseHandDto {
  @IsString()
  @Length(1, 80)
  roomId!: string;

  @IsBoolean()
  raised!: boolean;
}
