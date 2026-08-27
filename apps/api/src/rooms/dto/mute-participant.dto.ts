import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class MuteParticipantDto {
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(3600)
  durationSeconds?: number;
}
