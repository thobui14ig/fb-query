import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import { firstValueFrom } from "rxjs";
import { decodeCommentId, extractPhoneNumber, getHttpAgent } from "src/common/utils/helper";
import { ProxyService } from "src/modules/proxy/proxy.service";
import { getBodyComment, getHeaderComment } from "../../utils";
import { isNumeric } from "src/common/utils/check-utils";
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import { IGetCmtPublicResponse } from "./get-comment-public.i";
import { ProxyEntity } from "src/modules/proxy/entities/proxy.entity";
import { GetUuidUserUseCase } from "../get-uuid-user/get-uuid-user";
import { CommentEntity } from "src/modules/comments/entities/comment.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

dayjs.extend(utc);

@Injectable()
export class GetCommentPublicUseCase {
    fbUrl = 'https://www.facebook.com';
    fbGraphql = `https://www.facebook.com/api/graphql`;

    constructor(private readonly httpService: HttpService,
        private proxyService: ProxyService,
        private getUuidUserUseCase: GetUuidUserUseCase,
        @InjectRepository(CommentEntity)
        private cmtRepository: Repository<CommentEntity>,
    ) { }


    async getCmtPublic(postId: string, isCheckInfoLink: boolean = false): Promise<IGetCmtPublicResponse | null> {
        const postIdString = `feedback:${postId}`;
        const encodedPostId = Buffer.from(postIdString, 'utf-8').toString('base64');

        try {
            const headers = getHeaderComment(this.fbUrl);
            const body = getBodyComment(encodedPostId);
            const proxy = await this.proxyService.getRandomProxy()
            if (!proxy) return null
            const httpsAgent = getHttpAgent(proxy)

            const response = await firstValueFrom(
                this.httpService.post(this.fbGraphql, body, {
                    headers,
                    httpsAgent
                }),
            )

            if (response.data?.errors?.[0]?.code === 1675004) {
                await this.proxyService.updateProxyFbBlock(proxy)
                return this.getCmtPublic(postId)
            }

            if (isCheckInfoLink) {//không phải là link public
                if (!response?.data?.data?.node) {
                    return {
                        hasData: false
                    }
                } else {
                    return {
                        hasData: true,
                    }
                }
            }

            let dataComment = await this.handleDataComment(response)

            if (!dataComment && typeof response.data === 'string') {
                const text = response.data
                const lines = text.trim().split('\n');
                const data = JSON.parse(lines[0])
                dataComment = await this.handleDataComment({ data })
            }

            if (!dataComment) {
                //bai viet ko co cmt moi nhat => lay all
                dataComment = await this.getCommentWithCHRONOLOGICAL_UNFILTERED_INTENT_V1(encodedPostId, proxy)
            }

            return {
                hasData: true,
                data: dataComment
            }
        } catch (error) {
            return null
        }
    }

    async handleDataComment(response) {
        const comment =
            response?.data?.data?.node?.comment_rendering_instance_for_feed_location
                ?.comments.edges?.[0]?.node;
        if (!comment) return null
        const commentId = decodeCommentId(comment?.id) ?? comment?.id

        const commentMessage =
            comment?.preferred_body && comment?.preferred_body?.text
                ? comment?.preferred_body?.text
                : 'Sticker';

        const phoneNumber = extractPhoneNumber(commentMessage);
        const userNameComment = comment?.author?.name;
        const commentCreatedAt = dayjs(comment?.created_time * 1000).utc().format('YYYY-MM-DD HH:mm:ss');
        const serialized = comment?.discoverable_identity_badges_web?.[0]?.serialized;
        let userIdComment = serialized ? JSON.parse(serialized).actor_id : comment?.author.id
        const totalCount = response?.data?.data?.node?.comment_rendering_instance_for_feed_location?.comments?.total_count
        const totalLike = response?.data?.data?.node?.comment_rendering_instance_for_feed_location?.comments?.count
        userIdComment = (isNumeric(userIdComment) ? userIdComment : (await this.getUuidUserUseCase.getUuidUser(comment?.author.id)) || userIdComment)
        const commentEnity = await this.cmtRepository.findOne({
            where: {
                cmtId: commentId
            }
        })
        if (!commentEnity) {
            userIdComment = (isNumeric(userIdComment) ? userIdComment : (await this.getUuidUserUseCase.getUuidUser(comment?.author.id)) || userIdComment)
        } else {
            userIdComment = commentEnity.uid
        }

        return {
            commentId,
            userNameComment,
            commentMessage,
            phoneNumber,
            userIdComment,
            commentCreatedAt,
            totalCount,
            totalLike
        };
    }

    async getCommentWithCHRONOLOGICAL_UNFILTERED_INTENT_V1(postIdString: string, proxy: ProxyEntity) {
        const httpsAgent = getHttpAgent(proxy)

        const fetchCm = async (after = null) => {
            if (!after) {
                const headers = getHeaderComment(this.fbUrl);
                let body = {
                    av: '0',
                    __aaid: '0',
                    __user: '0',
                    __a: '1',
                    __req: 'h',
                    dpr: '1',
                    __ccg: 'GOOD',
                    __rev: '1019099659',
                    __s: 'nvbf2u:n9bd15:vnouit',
                    __hsi: '7454361444484971104',
                    __dyn:
                        '7xeUmwlEnwn8yEqxemh0no6u5U4e1Nxt3odEc8co2qwJyE24wJwpUe8hw2nVE4W0te1Rw8G11wBz83WwgEcEhwnU2lwv89k2C1Fwc60D85m1mzXw8W58jwGzE2ZwJK14xm3y1lU5O0Gpo8o1mpEbUGdwda3e0Lo4q58jwTwNwLwFg2Xwkoqwqo4eE7W1iwo8uwjUy2-2K0UE',
                    __csr:
                        'glgLblEoxcJiT9dmdiqkBaFcCKmWEKHCJ4LryoG9KXx6V4VECaG4998yuimayo-49rDz4fyKcyEsxCFohheVoogOt1aVo-5-iVKAh4yV9bzEC4E8FaUcUSi4UgzEnw7Kw1Gp5xu7AQKQ0-o4N07QU2Lw0TDwfu04MU1Gaw4Cw6CxiewcG0jqE2IByE1WU0DK06f8F31E03jTwno1MS042pA2S0Zxaxu0B80x6awnEx0lU3AwzxG3u0Ro1YE1Eo-32ow34wCw9608vwVo19k059U0LR08MNu8kc05lCabxG0UUjBwaadBweq0y8kwdh0kS0gq2-0Dokw1Te0O9o1rsMS1GKl1MM0JSeCa014aw389o1pOwr8dU0Pu0Cix60gR04YweK1raqagS0UA08_o1bFjj0fS42weG0iC0dwwvUuyJ05pw4Goog1680iow2a8',
                    __comet_req: '15',
                    lsd: 'AVqpeqKFLLc',
                    jazoest: '2929',
                    __spin_r: '1019099659',
                    __spin_b: 'trunk',
                    __spin_t: '1735603773',
                    fb_api_caller_class: 'RelayModern',
                    fb_api_req_friendly_name: 'CommentListComponentsRootQuery',
                    variables: `{
              "commentsIntentToken": "CHRONOLOGICAL_UNFILTERED_INTENT_V1",
              "feedLocation": "PERMALINK",
              "feedbackSource": 2,
              "focusCommentID": null,
              "scale": 1,
              "useDefaultActor": false,
              "id": "${postIdString}",
              "__relay_internal__pv__IsWorkUserrelayprovider": false
            }`,
                    server_timestamps: 'true',
                    doc_id: '9051058151623566',
                }

                return await firstValueFrom(
                    this.httpService.post(this.fbGraphql, body, {
                        headers,
                        httpsAgent
                    }),
                )
            }

            const res = await firstValueFrom(
                this.httpService.post("https://www.facebook.com/api/graphql/", `av=0&__aaid=0&__user=0&__a=1&__req=h&__hs=20215.HYP%3Acomet_loggedout_pkg.2.1...0&dpr=1&__ccg=EXCELLENT&__rev=1022594794&__s=h4jekx%3Apdamzq%3Aoxbhj3&__hsi=7501715228560864879&__dyn=7xeUmwlEnwn8K2Wmh0no6u5U4e0yoW3q322aew9G2S0zU20xi3y4o11U1lVE4W0qafw9q0yE462mcwfG12wOx62G3i0Bo7O2l0Fwqob82kw9O1lwlE-U2exi4UaEW0Lobrwh8lw8Xxm16waCm260im3G2-azo3iwPwbS16wEwTwNwLwFg2Xwkoqwqo4eE7W1iwGBG2O7E5y1rwea1ww&__csr=gatn4EAbPNZJlitbBbtrFH-Ku9AhrXKAQuvt7DoGmjAKuBLJ2rx1auUKpqJ7-jAKdWGuVFFokxeEkDzrzUGcQh5CChGFa3aGhEK4HUvDyEpBgaVHzpV-bybhoGUC2afBxC2G5ozz8iw2n8ybzE38w2RU3ug2OU3Bw20U089u06eXwOwUweK042U2Tw9p071gGbg0tiw14K-1Qwb60c0w08quh5xp01QK0aoxGFkl6w0HSo3E_U21yo0Xq0arw6_y2i07Vw8O0o-07Do0SME1u80xRwjUuwb-fwd208uw6Iw65wGAxS0nC2-3C0bVw960ayw17u0e9Aw2A62W1MxRw7kw2sQ1CyUJ1q0NU-0f880cfojyE1x80P20IEao3Az8eEfE0mHwQw0CZw2Vo7G0b9w3xS6m07KU0Ip04Iw4LwcqsK0d5U&__comet_req=15&lsd=AVori-u58Do&jazoest=2931&__spin_r=1022594794&__spin_b=trunk&__spin_t=1746629185&__crn=comet.fbweb.CometVideoHomeLOEVideoPermalinkRoute&fb_api_caller_class=RelayModern&fb_api_req_friendly_name=CommentsListComponentsPaginationQuery&variables=%7B%22commentsAfterCount%22%3A-1%2C%22commentsAfterCursor%22%3A%22${after}%22%2C%22commentsBeforeCount%22%3Anull%2C%22commentsBeforeCursor%22%3Anull%2C%22commentsIntentToken%22%3Anull%2C%22feedLocation%22%3A%22TAHOE%22%2C%22focusCommentID%22%3Anull%2C%22scale%22%3A1%2C%22useDefaultActor%22%3Afalse%2C%22id%22%3A%22${postIdString}%22%2C%22__relay_internal__pv__IsWorkUserrelayprovider%22%3Afalse%7D&server_timestamps=true&doc_id=9830142050356672`, {
                    headers: {
                        "accept": "*/*",
                        "accept-language": "en-US,en;q=0.9,vi;q=0.8",
                        "content-type": "application/x-www-form-urlencoded",
                        "priority": "u=1, i",
                        "sec-ch-prefers-color-scheme": "light",
                        "sec-ch-ua": "\"Google Chrome\";v=\"135\", \"Not-A.Brand\";v=\"8\", \"Chromium\";v=\"135\"",
                        "sec-ch-ua-full-version-list": "\"Google Chrome\";v=\"135.0.7049.116\", \"Not-A.Brand\";v=\"8.0.0.0\", \"Chromium\";v=\"135.0.7049.116\"",
                        "sec-ch-ua-mobile": "?0",
                        "sec-ch-ua-model": "\"\"",
                        "sec-ch-ua-platform": "\"Windows\"",
                        "sec-ch-ua-platform-version": "\"10.0.0\"",
                        "sec-fetch-dest": "empty",
                        "sec-fetch-mode": "cors",
                        "sec-fetch-site": "same-origin",
                        "x-asbd-id": "359341",
                        "x-fb-friendly-name": "CommentsListComponentsPaginationQuery",
                        "x-fb-lsd": "AVori-u58Do",
                        "Referrer-Policy": "strict-origin-when-cross-origin"
                    },
                    httpsAgent
                }),
            )

            let data = null
            if (typeof res.data === "string") {
                const lines = res.data.trim().split('\n');
                data = JSON.parse(lines[0])
            } else {
                data = res.data
            }

            return {
                data
            }

        }

        let after = null;
        let hasNextPage = true;
        let responsExpected = null;
        let commentCount = null
        let likeCount = null

        while (hasNextPage) {
            const response = await fetchCm(after);
            const pageInfo = response?.data?.data?.node?.comment_rendering_instance_for_feed_location?.comments?.page_info || {};
            responsExpected = response
            hasNextPage = pageInfo.has_next_page;
            after = pageInfo.end_cursor;
        }

        const comment =
            responsExpected?.data?.data?.node?.comment_rendering_instance_for_feed_location
                ?.comments.edges?.reverse()?.[0]?.node;

        if (!comment) return null
        const commentId = decodeCommentId(comment?.id) ?? comment?.id
        const commentMessage =
            comment?.preferred_body && comment?.preferred_body?.text
                ? comment?.preferred_body?.text
                : 'Sticker';

        const phoneNumber = extractPhoneNumber(commentMessage);
        const userNameComment = comment?.author?.name;
        const commentCreatedAt = dayjs(comment?.created_time * 1000).utc().format('YYYY-MM-DD HH:mm:ss');
        const serialized = comment?.discoverable_identity_badges_web?.[0]?.serialized;
        let userIdComment = serialized ? JSON.parse(serialized).actor_id : comment?.author.id
        const commentEnity = await this.cmtRepository.findOne({
            where: {
                cmtId: commentId
            }
        })
        if (!commentEnity) {
            userIdComment = (isNumeric(userIdComment) ? userIdComment : (await this.getUuidUserUseCase.getUuidUser(comment?.author.id)) || userIdComment)
        } else {
            userIdComment = commentEnity.uid
        }

        const totalCount = commentCount
        const totalLike = likeCount

        return {
            commentId,
            userNameComment,
            commentMessage,
            phoneNumber,
            userIdComment,
            commentCreatedAt,
            totalCount,
            totalLike
        };
    }
}