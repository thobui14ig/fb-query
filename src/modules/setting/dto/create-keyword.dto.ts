import { IsArray, IsNumber, IsOptional, IsString } from "class-validator";

export class CreateKeywordDto {
    @IsArray({ message: "Danh sách truyền lên phải là 1 mảng" })
    @IsString({ each: true, message: "Keyword phải là string" })
    keywords: string[]

    @IsOptional()
    @IsNumber()
    linkId: number
}
