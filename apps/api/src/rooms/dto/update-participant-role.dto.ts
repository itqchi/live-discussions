import { IsIn, IsString, Length } from 'class-validator';
import type { ParticipantRole } from '@live-discussions/contracts';

export class UpdateParticipantRoleDto {
  @IsString()
  @Length(1, 80)
  roomId!: string;

  @IsString()
  @Length(1, 120)
  participantId!: string;

  @IsIn(['owner', 'moderator', 'speaker', 'listener'])
  role!: ParticipantRole;
}
