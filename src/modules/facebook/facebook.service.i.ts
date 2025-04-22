import { LinkType } from "../links/entities/links.entity";

export interface IGetProfileLinkResponse {
    type: LinkType,
    name?: string,
    postId?: string,
}
