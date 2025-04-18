import { ArrayNotEmpty, IsArray, IsEnum, IsNumber, IsString, Matches, ValidateNested } from "class-validator";
import { LinkStatus } from "../entities/links.entity";
import { Optional } from "@nestjs/common";
import { Type } from "class-transformer";

class LinkDto {
    @IsString()
    @Matches(/^https:\/\/www\.facebook\.com\//, { message: 'Each link must start with "https://www.facebook.com/"' })
    url: string

    @IsNumber()
    @Optional()
    delayTime?: number
}

export class CreateLinkDTO {
    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => LinkDto)
    links: LinkDto[];

    @IsEnum(LinkStatus)
    status: LinkStatus;
}