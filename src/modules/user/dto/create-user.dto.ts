import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class CreateUserDto {
  @IsString()
  username: string;

  @IsNumber()
  @IsOptional()
  level?: number;

  @IsNotEmpty()
  @IsString()
  password: string;

  expiredAt: Date

  @IsNumber()
  @IsOptional()
  linkAddLimit?: number

  @IsNumber()
  @IsOptional()
  linkStartLimit?: number

  @IsNumber()
  @IsOptional()
  delayOnPrivate?: number
}
