import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import { firstValueFrom } from "rxjs";
import { extractPhoneNumber, getHttpAgent } from "src/common/utils/helper";
import { ProxyService } from "src/modules/proxy/proxy.service";
import { getBodyComment, getHeaderComment } from "../../utils";
import { isNumeric } from "src/common/utils/check-utils";
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import { IGetCmtPublicResponse } from "./get-comment-public.i";

dayjs.extend(utc);

@Injectable()
export class GetCommentPublicUseCase {
    fbUrl = 'https://www.facebook.com';
    fbGraphql = `https://www.facebook.com/api/graphql`;

    constructor(private readonly httpService: HttpService,
        private proxyService: ProxyService,
    ) { }


    async getCmtPublic(postId: string): Promise<IGetCmtPublicResponse | null> {
        try {
            const headers = getHeaderComment(this.fbUrl);
            const body = getBodyComment(postId);
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

            if (!response?.data?.data?.node) {//không phải là link public
                return {
                    hasData: false
                }
            }

            return {
                hasData: true
                //còn nữa
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
        const commentId = comment?.id

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

        userIdComment = (isNumeric(userIdComment) ? userIdComment : (await this.getUuidUser(comment?.author.id)) || userIdComment)

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

    async getUuidUser(id: string) {
        let uid = await this.getUuidPublic(id)

        // if (!uid) {
        //     uid = await this.getUuidByCookie(id)
        // }
        // if (!uid) {
        //     uid = await this.getUuidByCookieV2(id)
        // }

        return uid;
    }

    async getUuidPublic(uuid: string) {
        try {
            const proxy = await this.proxyService.getRandomProxy()
            const httpsAgent = getHttpAgent(proxy)
            if (!proxy) { return null }

            const dataUser = await firstValueFrom(
                this.httpService.get(`https://www.facebook.com/${uuid}`, {
                    headers: {
                        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                        "accept-language": "en-US,en;q=0.9,vi;q=0.8",
                        "cache-control": "max-age=0",
                        "dpr": "1",
                        "priority": "u=0, i",
                        "sec-ch-prefers-color-scheme": "light",
                        "sec-ch-ua": "\"Chromium\";v=\"136\", \"Google Chrome\";v=\"136\", \"Not.A/Brand\";v=\"99\"",
                        "sec-ch-ua-full-version-list": "\"Chromium\";v=\"136.0.7103.93\", \"Google Chrome\";v=\"136.0.7103.93\", \"Not.A/Brand\";v=\"99.0.0.0\"",
                        "sec-ch-ua-mobile": "?0",
                        "sec-ch-ua-model": "\"\"",
                        "sec-ch-ua-platform": "\"Windows\"",
                        "sec-ch-ua-platform-version": "\"10.0.0\"",
                        "sec-fetch-dest": "document",
                        "sec-fetch-mode": "navigate",
                        "sec-fetch-site": "same-origin",
                        "sec-fetch-user": "?1",
                        "upgrade-insecure-requests": "1",
                        "viewport-width": "856",
                        "cookie": "sb=IpN2Z63pdgaswLIv6HwTPQe2; ps_l=1; ps_n=1; datr=Xr4NaIxUf5ztTudh--LM1AJd; ar_debug=1; fr=1Xto735zUPU2OEu0c.AWflQ0D_5CuaOWaOjYbz_rvh5wi_VEPLz1PnU4bPFw3P1QEiCUw.BoIMDi..AAA.0.0.BoINC4.AWc2m4manpDm55bav08ZEuzPD4A; wd=856x953"
                    },
                    httpsAgent
                }),
            );

            const html = dataUser.data
            const match = html.match(/"userID"\s*:\s*"(\d+)"/);
            if (match) {
                const userID = match[1];
                console.log("🚀 ~ getUuidPublic ~ userID:", userID)
                return userID
            }

            return null
        } catch (error) {
            console.log("🚀 ~ getUuidPublic ~ error:", error?.message)
            return null
        }
    }
}