import { Optional } from "@nestjs/common";
import { IsArray, IsNumber, IsOptional, IsString } from "class-validator";

export class CreateCookieDto {
    @IsArray({ message: "Danh sách truyền lên phải là 1 mảng" })
    @IsString({ each: true, message: "Cookie phải là string" })
    cookies: string[]

    @IsOptional()
    @IsNumber()
    pageId: number
}
