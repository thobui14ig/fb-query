import { HttpService } from "@nestjs/axios";
import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { firstValueFrom } from "rxjs";
import { changeCookiesFb, formatCookies, getHttpAgent } from "src/common/utils/helper";
import { CommentEntity } from "src/modules/comments/entities/comment.entity";
import { CookieEntity } from "src/modules/cookie/entities/cookie.entity";
import { HideBy } from "src/modules/links/entities/links.entity";
import { ProxyService } from "src/modules/proxy/proxy.service";
import { KeywordEntity } from "src/modules/setting/entities/keyword";
import { TokenService } from "src/modules/token/token.service";
import { DataSource, Repository } from "typeorm";

@Injectable()
export class HideCommentUseCase {
    constructor(private readonly httpService: HttpService,
        private proxyService: ProxyService,
        private tokenService: TokenService,
        @InjectRepository(CookieEntity)
        private cookieRepository: Repository<CookieEntity>,
        @InjectRepository(CommentEntity)
        private commentRepository: Repository<CommentEntity>,
        @InjectRepository(KeywordEntity)
        private keywordRepository: Repository<KeywordEntity>,
        private connection: DataSource,
    ) {
    }

    async hideComment(userId: number, type: HideBy, cmtId: number) {
        const cookie = await this.cookieRepository.findOne({
            where: {
                createdBy: userId
            }
        })
        if (!cookie) {
            throw new HttpException(
                `không tìm thấy cookie.`,
                HttpStatus.BAD_REQUEST,
            );
        }

        let comments = null
        // if (type === HideBy.ALL) {
        //     comments = await this.commentRepository.find({
        //         where: {
        //             linkId
        //         }
        //     })
        // }

        // if (type === HideBy.PHONE) {
        //     comments = await this.connection.query(`select cmtid as cmtId from comments where link_id = ${linkId} and phone_number is not null`)
        // }


        if (type === HideBy.KEYWORDS) {
            const keywords = await this.keywordRepository.find({
                where: {
                    userId
                }
            })

            if (!keywords.length) {
                throw new HttpException(
                    `không tìm thấy keywords.`,
                    HttpStatus.BAD_REQUEST,
                );
            }
            let likeString = ''
            for (let i = 0; i < keywords.length; i++) {
                const keyword = keywords[i]
                if (i === 0) {
                    likeString += `'\\\\b${keyword.keyword}\\\\b'`;
                    continue;
                }

                likeString += ` or message RLIKE '\\\\b${keyword.keyword}\\\\b'`;
            }

            // comments = await this.connection.query(`select cmtid as cmtId from comments where link_id = ${linkId} and (message RLIKE ${likeString})`)
        }

        if (comments.length === 0) {
            throw new HttpException(
                `Không có comment nào để ẩn`,
                HttpStatus.BAD_GATEWAY,
            );
        }

        for (const comment of comments) {
            const res = await this.callApihideCmt(comment.cmtId, cookie)
            if (res?.errors?.length > 0 && res?.errors[0].code === 1446036) {
                throw new HttpException(
                    `Comment đã được ẩn.`,
                    HttpStatus.BAD_GATEWAY,
                );
            }
            await this.commentRepository.save({ ...comment, hideCmt: true })
        }
    }


    async callApihideCmt(cmtId: string, cookie: CookieEntity) {
        try {
            const proxy = await this.proxyService.getRandomProxy()
            const httpsAgent = getHttpAgent(proxy)
            const cookies = changeCookiesFb(cookie.cookie);
            const { facebookId, fbDtsg, jazoest } = await this.getInfoAccountsByCookie(cookie.cookie)

            if (!proxy) {
                return false
            }

            const data = {
                av: facebookId,
                __aaid: '0',
                __user: facebookId,
                __a: '1',
                __req: '1c',
                __hs: '20235.HYP:comet_pkg.2.1...0',
                dpr: '1',
                __ccg: 'EXCELLENT',
                __rev: '1023204200',
                __s: '8iww8r:ezx19i:v2za4k',
                __hsi: '7509172227721751248',
                __dyn: '7xeXzWK1ixt0mUyEqxemh0noeEb8nwgUao4ubyQdwSwAyUco5S3O2Saw8i2S1DwUx60GE3Qwb-q7oc81EEbbwto88422y11wBz83WwgEcEhwGxu782lwv89kbxS1Fwc61awkovwRwlE-U2exi4UaEW2au1jwUBwJK14xm3y11xfxmu3W3y261eBx_wHwUwa67EbUG2-azqwaW223908O3216xi4UK2K2WEjxK2B08-269wkopg6C13xe3a3Gfw-KufxamEbbxG1fBG2-2K0E846fwk8eo3ww',
                __csr: 'gfclNAdMzNIrs5k9T4ltNdSyWbd5MnROTtZFR7Pq9HRQMDFICi-LJdnmGTK_dsGOvlQGqpZkWl9tQxhkhpvRGykmJ2-AHjHFqLEzp5QJGRJkAiQiWKnBQt5gLDVFAjmKAb8hbLWKSAUhCtZHGuiVAla8VWBZ94VbjhFKF99aCLGppZeHAHggGHAgGh5Dx6nCGaiy-9KaHBim9zWyEyFaChFdu4ojVqiACHxm9Ax6Voyi5oHF29prxmUhyk9DBLADAzoOEx4h9UC7ohzXAxiF99Z1rUymfgOdxha4KhXXJGdCxueKDF4K6GgZx22O9y8pykFKudACzUC2adyogK8GUyibzEC2C3Snxe48yqXUmyE8UyE9U5R0hoqkw9oKuu684e226GwEyUTg8p8b86Gi0zC1vAxm1IKDws87Kq1lCDxzoC13Q1GCZmdwprUfEGcDyGz9A9g5104_wRw9G1ijh_gvwGzE8bybAypK3S0Qo4S0MEgqJBQ5rAyopqy8xaUjUGbkE5mh0e21jQ320Bo4CfzoK5J0RwHwCwRx2eDy8vDDwww0FQw3EU0ixyU0FO0tBk0Jm6U0Gi0pK00ZTE3Sw6mwh8c84qaCw2680Ia0CEe40Y406gEhwgQm0CU7G0m20-U0wm19w1h10no3Pw2YE0Te1Ewb_woqxi35Cy4bw2mU25w2hE2ByU1_Uzg1d85uagF2F80tKc04We05zk0vm4E0zm0jaE6m8O0jIx9U17cwW1Lw4rxG0ri0hO1Uwbx0ho0o1w9O8T81RwmUyb7iwMwZwto0zC8Q',
                __hsdp: 'gc41882ewCgQy7A55GjAeO4hAuy2VBoQY4F22F19kR9XSN14uCqCtIaQQGiloPgmeKkB8tAnAdgxIiyyGr42SlAm_8kxih2PxVkygDJ6SX9qb4r4eyN4aiMx1YFa1sBOPTkAasaMKmKxD2uFa4mkh7IP4Zhf2YNABFFRgKBpkCh8ygBBO7A4a96FmkgKQIkyt58GhiqH8FP6mInjc4GWSCNlNhnQVczAOyiebXJan8SOKpesPVyBowxa8TUJA52_6BGaBF7avCEyDGhcHy48aF4zBFeuAEVeu6HAyCXmjgGbOEkbgCAaBoak68x5xJoB6zp9orwFBzSZ2agbkdgh8fjaq58targPgW32-W8R4PDz88V49J3SgaP3oSaoryV8gg4CUKfwzBoSpamVi2FXpbhm5obkbJ5h4en82i2i2y3aEcUixx0goCpxa6pUiz9pox2Qqh4oeE2gwiEOqyfsmEK8wFy8k_goxF8M-ag88vxQEqxnhUbEWi78hgC3m21114yr3Egxucxt28ptKQ7o-2am8odA16hUtg4bIE2DK2zwzByU5q3i365E8E6pwOwFwHwkUG4Q4U21wFyUoCwhU72jwpobUmG3O125wmo884ec8684W1-xl05kzpGyo2LwIg-3u3O0IA1hzUiz8hBxW3edwTwOUao3JBwTBzpo720wE4a3u0Vohwt86-1ZxC220hu0BUW14waS0VErK4Uy68ak2e5Uy1SDCze1OwdiU6S2q0z42W6o20xG1ywlu7EcF8gwTwkU0T2Uy4UG1IwtU6S0Bo7Wbwv_xO0PU3HwwwMxG22E28w2bEbEbu6osg3xw',
                __hblp: '0qd08F1t447iykbx26V8K1jwrEbEkxC1aG3G1vxe1GxC0Y9o5C5E8UnAypUN0921SG3CeCwxwMxe48K2KqbByUvx2ewFwByE9U2JwpEaEjzEJ0QxWbxu68O3u3K1owmp8swgGw9adzU8VUowAxu15x2bzUowoocGxy2S6mt0n88ovxi220HU6uczUvy8owKxZ1-3-3XwYwZwxwywoV8C7Ea8S5UC6E6V0Swi89E4ibwda19wgE6q3Cu6ovxu11CxuawHwTxK7U2_wHwwwCwm8nAUiBwzwm9ogG3N0ywxwXwAwwwr9oC3KE7W5k0x8O2Kdzo8o5y260BUnzEtg-1QCwzwce2q8w8615z89u2C4UeU2tBwRxm0iy4UbE3Kx6m222mm7rxa1swvopwww4nwrEa8W14xy0B83CxKUjy8owFg8Uny87quqcU7a4USfho2mAK1JwCw8N0KxC2a1txmbzoszUTx22u4E-aUK4E8ogAx23u3W583-wjE3DwlUiw9u3uUy8xaz0cq5qwiU8o9U6S1-yU651Ju785W7oW4EK2i0WU7WeG1rw2mawKwJUpDxh0e6',
                __comet_req: '15',
                fb_dtsg: fbDtsg,
                jazoest: jazoest,
                lsd: 'BQthffrujiJFA2Lct_sKIe',
                __spin_r: '1023204200',
                __spin_b: 'trunk',
                __spin_t: '1748365403',
                __crn: 'comet.fbweb.CometProfileTimelineListViewRoute',
                fb_api_caller_class: 'RelayModern',
                fb_api_req_friendly_name: 'CometUFIHideCommentMutation',
                variables: `{"input":{"comment_id":"${cmtId}","feedback_source":0,"hide_location":"MENU","site":"comet","actor_id":"${facebookId}","client_mutation_id":"1"},"feedLocation":"TIMELINE","useDefaultActor":false,"scale":1,"__relay_internal__pv__CometUFI_dedicated_comment_routable_dialog_gkrelayprovider":false}`,
                server_timestamps: 'true',
                doc_id: '9829593003796713'
            }

            const response = await firstValueFrom(
                this.httpService.post("https://www.facebook.com/api/graphql/", new URLSearchParams(data).toString(), {
                    "headers": {
                        "accept": "*/*",
                        "accept-language": "en-US,en;q=0.9,vi;q=0.8",
                        "content-type": "application/x-www-form-urlencoded",
                        "priority": "u=1, i",
                        "sec-ch-prefers-color-scheme": "light",
                        "sec-ch-ua": "\"Chromium\";v=\"136\", \"Google Chrome\";v=\"136\", \"Not.A/Brand\";v=\"99\"",
                        "sec-ch-ua-full-version-list": "\"Chromium\";v=\"136.0.7103.114\", \"Google Chrome\";v=\"136.0.7103.114\", \"Not.A/Brand\";v=\"99.0.0.0\"",
                        "sec-ch-ua-mobile": "?0",
                        "sec-ch-ua-model": "\"\"",
                        "sec-ch-ua-platform": "\"Windows\"",
                        "sec-ch-ua-platform-version": "\"10.0.0\"",
                        "sec-fetch-dest": "empty",
                        "sec-fetch-mode": "cors",
                        "sec-fetch-site": "same-origin",
                        "x-asbd-id": "359341",
                        "x-fb-friendly-name": "CometUFIHideCommentMutation",
                        "x-fb-lsd": "BQthffrujiJFA2Lct_sKIe",
                        "cookie": formatCookies(cookies),
                        "Referrer-Policy": "strict-origin-when-cross-origin"
                    },
                    httpsAgent,
                }),
            );
            return response.data
        } catch (error) {
            return false
        }
    }


    async getInfoAccountsByCookie(cookie: string) {
        const maxRetries = 3;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const proxy = await this.proxyService.getRandomProxy();
                if (!proxy) return null
                const httpsAgent = getHttpAgent(proxy);
                const cookies = changeCookiesFb(cookie);

                const dataUser = await firstValueFrom(
                    this.httpService.get('https://www.facebook.com', {
                        headers: {
                            Cookie: formatCookies(cookies),
                        },
                        httpsAgent,
                    }),
                );

                const dtsgMatch = dataUser.data.match(/DTSGInitialData",\[\],{"token":"(.*?)"}/);
                const jazoestMatch = dataUser.data.match(/&jazoest=(.*?)"/);
                const userIdMatch = dataUser.data.match(/"USER_ID":"(.*?)"/);

                if (dtsgMatch && jazoestMatch && userIdMatch) {
                    const fbDtsg = dtsgMatch[1];
                    const jazoest = jazoestMatch[1];
                    const facebookId = userIdMatch[1];
                    return { fbDtsg, jazoest, facebookId };
                }

            } catch (error) {
                console.warn(`⚠️ Attempt ${attempt} failed: ${error.message}`);
            }

            // Optional: delay giữa các lần thử (nếu cần tránh spam)
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1 giây
        }

        // Sau 3 lần đều fail
        return null;
    }

}

