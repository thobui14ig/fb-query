
import { IsBoolean, IsEnum, IsNumber, IsString } from "class-validator";
import { LinkType } from "../entities/links.entity";

export class UpdateLinkDTO {
    @IsNumber()
    id: number;

    @IsString()
    linkName: string;

    @IsEnum(LinkType)
    type?: LinkType;

    @IsNumber()
    delayTime?: number;

    @IsBoolean()
    hideCmt: boolean;
}