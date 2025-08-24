import { IsArray, IsString } from "class-validator";

export class CreateVpsDto {
    @IsArray({ message: "Danh sách truyền lên phải là 1 mảng" })
    @IsString({ each: true, message: "Vps phải là string" })
    vps: string[]
}
