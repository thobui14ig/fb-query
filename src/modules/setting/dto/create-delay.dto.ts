import { IsNumber, IsString } from "class-validator";

export class CreateDelayDTO {
    @IsNumber()
    refreshToken: number;

    @IsNumber()
    refreshCookie: number;

    @IsNumber()
    refreshProxy: number;

    @IsNumber()
    timeRemoveProxySlow: number

    @IsString()
    vip: string

    @IsString()
    popular: string
}