import { LinkEntity, LinkStatus, LinkType } from "../links/entities/links.entity";

export interface GroupedLinksByType {
    public: IPostStarted[];
    private: IPostStarted[];
}

export interface IPostStarted {
    postId: string,
    status: LinkStatus,
    type: LinkType
}