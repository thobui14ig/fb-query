import { IsNumber } from "class-validator";

export class CreateDelayDTO {
    @IsNumber()
    delayCheck: number;

    @IsNumber()
    delayLinkOn: number;

    @IsNumber()
    delayLinkOff: number;
}