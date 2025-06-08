import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import { AxiosResponse } from "axios";
import { firstValueFrom } from "rxjs";
import { getHttpAgent } from "src/common/utils/helper";
import { ProxyService } from "src/modules/proxy/proxy.service";
import { TokenStatus } from "src/modules/token/entities/token.entity";
import { TokenService } from "src/modules/token/token.service";
import { IFacebookUser } from "./get-uuid-user.i";
import { writeFile } from "src/common/utils/file";

@Injectable()
export class GetUuidUserUseCase {
    constructor(private readonly httpService: HttpService,
        private proxyService: ProxyService,
        private tokenService: TokenService
    ) {
    }

    async getUuidUserPublic(uuid: string): Promise<string | null> {
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
                return userID
            }

            return null
        } catch (error) {
            console.log("🚀 ~ getUuidPublic ~ error:", error?.message)
            return null
        }
    }

    async getUuidUserToken(uuid: string): Promise<string | null> {
        const proxy = await this.proxyService.getRandomProxy()
        const token = await this.tokenService.getTokenActiveFromDb()
        if (!proxy || !token) { return null }
        const httpsAgent = getHttpAgent(proxy)
        const params = {
            "order": "reverse_chronological",
            "limit": "1000",
            "access_token": token.tokenValue,
            "created_time": "created_time"
        }

        try {
            const response: AxiosResponse<IFacebookUser, any> = await firstValueFrom(
                this.httpService.get(`https://graph.facebook.com/${uuid}`, {
                    httpsAgent,
                    params
                }),
            );
            if (response.data.id) {
                return response.data.id
            }

            return null
        } catch (error) {
            if (error.response?.data?.error?.code === 190) {//check point
                await this.tokenService.updateStatusToken(token, TokenStatus.DIE)
            }
            if ((error?.message as string)?.includes('connect ECONNREFUSED') || error?.status === 407 || (error?.message as string)?.includes('connect EHOSTUNREACH') || (error?.message as string)?.includes('Proxy connection ended before receiving CONNECT')) {
                await this.proxyService.updateProxyDie(proxy)
            }

            if (error?.response?.status == 400) {
                if (error.response?.data?.error?.code === 368) {
                    await this.tokenService.updateStatusToken(token, TokenStatus.LIMIT)
                }
                if (error.response?.data?.error?.code === 190) {
                    await this.tokenService.updateStatusToken(token, TokenStatus.DIE)
                }

                if (error.response?.data?.error?.code === 10) {
                    await this.tokenService.updateStatusToken(token, TokenStatus.DIE)
                }
            }
            return null
        }
    }

    async getUuidUser(uuid: string) {
        let uidPublic = await this.getUuidUserPublic(uuid)
        if (uidPublic) return uidPublic
        const uidPrivate = await this.getUuidUserToken(uuid)

        if (uidPrivate) return uidPrivate

        return null
    }
}