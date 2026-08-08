import type { ModeratedParticipantRole } from '@live-discussions/contracts';
import { IsIn, IsString, Length } from 'class-validator';

export class UpdateParticipantRoleDto {
  @IsString()
  @Length(1, 80)
  roomId!: string;

  @IsString()
  @Length(1, 120)
  participantId!: string;

  @IsIn(['speaker', 'listener'])
  role!: ModeratedParticipantRole;
}
