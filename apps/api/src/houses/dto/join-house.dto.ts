import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class JoinHouseDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 80)
  houseId!: string;
}
