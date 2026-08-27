import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class UpdateHouseDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 80)
  name!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(0, 240)
  description!: string;
}
