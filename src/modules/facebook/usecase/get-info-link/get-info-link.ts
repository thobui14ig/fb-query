import { faker } from '@faker-js/faker';
import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import { AxiosResponse } from "axios";
import { firstValueFrom } from "rxjs";
import { getHttpAgent } from "src/common/utils/helper";
import { LinkType } from "src/modules/links/entities/links.entity";
import { ProxyService } from "src/modules/proxy/proxy.service";
import { TokenStatus } from "src/modules/token/entities/token.entity";
import { TokenService } from "src/modules/token/token.service";
import { IFacebookResponse, IGetInfoLinkResponse } from "./get-info-link.i";


@Injectable()
export class GetInfoLinkUseCase {
    constructor(private readonly httpService: HttpService,
        private tokenService: TokenService,
        private proxyService: ProxyService,
    ) {
    }

    async getInfoLink(postId: string): Promise<IGetInfoLinkResponse> | null {
        const proxy = await this.proxyService.getRandomProxy()
        const token = await this.tokenService.getTokenGetInfoActiveFromDb()
        if (!proxy || !token) {
            return {
                linkType: LinkType.UNDEFINED
            }
        }

        try {
            const httpsAgent = getHttpAgent(proxy)
            const languages = [
                'en-US,en;q=0.9',
                'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
                'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7'
            ];

            const userAgent = faker.internet.userAgent()
            const apceptLanguage = languages[Math.floor(Math.random() * languages.length)]

            const headers = {
                'authority': 'graph.facebook.com',
                'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="99", "Opera";v="85"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'upgrade-insecure-requests': '1',
                'user-agent': userAgent,
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
                'sec-fetch-site': 'none',
                'sec-fetch-mode': 'navigate',
                'sec-fetch-user': '?1',
                'sec-fetch-dest': 'document',
                'accept-language': apceptLanguage,
            };
            const response: AxiosResponse<IFacebookResponse, any> = await firstValueFrom(
                this.httpService.get(`https://graph.facebook.com/${postId}?access_token=${token.tokenValue}`, {
                    headers,
                    httpsAgent
                }),
            );
            const { name: linkName, id: pageId } = response.data.from || {}
            const { id } = response.data

            return {
                id,
                linkName,
                linkType: LinkType.PUBLIC, //mạc định sẽ là public
                pageId
            }
        } catch (error) {
            console.log("🚀 ~ GetInfoLinkUseCase ~ getInfoLink ~ error:", error.response.data)
            if (error.response?.data?.error?.code === 100 && (error?.response?.data?.error?.message as string)?.includes('Unsupported get request. Object with ID')) {
                return {
                    linkType: LinkType.DIE
                }
            }

            if (error.response?.data?.error?.code === 190) {//check point
                await this.tokenService.updateStatusToken(token, TokenStatus.DIE)
            }

            return {
                linkType: LinkType.UNDEFINED
            }
        }
    }
}