import { CreateLinkDTO } from "./dto/create-link.dto";

export interface CreateLinkParams extends CreateLinkDTO {
    userId: number
}