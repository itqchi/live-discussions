import { IsIn, IsString, Length } from 'class-validator';

export class UpdateHouseMemberRoleDto {
  @IsString()
  @Length(1, 120)
  userId!: string;

  @IsIn(['admin', 'member'])
  role!: 'admin' | 'member';
}
