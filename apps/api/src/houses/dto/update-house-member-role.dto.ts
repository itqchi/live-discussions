import { IsIn } from 'class-validator';

export class UpdateHouseMemberRoleDto {
  @IsIn(['admin', 'member'])
  role!: 'admin' | 'member';
}
