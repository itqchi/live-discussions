import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class RemoveParticipantDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 80)
  roomId!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 160)
  participantId!: string;
}
