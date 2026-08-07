import type { JoinRoomRequest } from '@live-discussions/contracts';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class JoinRoomDto implements JoinRoomRequest {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 80)
  roomId!: string;
}
