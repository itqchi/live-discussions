import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';

export class SetFeaturedParticipantDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 80)
  roomId!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @Length(1, 160)
  participantId!: string | null;
}
