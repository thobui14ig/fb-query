import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import { HttpsProxyAgent } from "https-proxy-agent";
import { firstValueFrom } from "rxjs";
import { ProxyEntity, ProxyStatus } from "src/modules/proxy/entities/proxy.entity";
import { TokenEntity, TokenStatus } from "src/modules/token/entities/token.entity";
import { In, IsNull, Not, Repository } from "typeorm";
import { fa, faker } from '@faker-js/faker';
import { getHttpAgent } from "src/common/utils/helper";
import { TokenService } from "src/modules/token/token.service";
import { ProxyService } from "src/modules/proxy/proxy.service";
import { IFacebookResponse, IGetInfoLinkResponse } from "./get-info-link.i";
import { AxiosResponse } from "axios";
import { LinkEntity, LinkType } from "src/modules/links/entities/links.entity";
import { InjectRepository } from "@nestjs/typeorm";


@Injectable()
export class GetInfoLinkUseCase {
    constructor(private readonly httpService: HttpService,
        private tokenService: TokenService,
        private proxyService: ProxyService,
        @InjectRepository(LinkEntity)
        private linkRepository: Repository<LinkEntity>,
    ) {
    }

    async getInfoLink(postId: string): Promise<IGetInfoLinkResponse> | null {
        try {
            const proxy = await this.proxyService.getRandomProxy()
            // const token = await this.tokenService.getTokenEAAAAAYActiveFromDb()
            // if (!proxy || !token) { return null }
            if (!proxy) {
                return {
                    linkType: LinkType.UNDEFINED
                }
            }

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
                this.httpService.get(`https://graph.facebook.com/${postId}?access_token=EAAAAUaZA8jlABO4P7KeZAAAOJ5EZB5TZBFD4RUHT8oJlkxlfQ3FQbPTobySA5O9mC4maihxT6VoOQ0YfHW7b2grrGcsjdgJqqiaKizMlxabvJBHa1ZA3o4LO1V4Mp71TrvYBw8iTn0RnnmEkZCpsTYSIFTv5ZAWPYKmlLdgteMPZBp33Y8TZBaiincDviCBGdpH2TCqMx7QZDZD`, {
                    headers,
                    httpsAgent
                }),
            );
            const { name: linkName } = response.data.from
            const { id } = response.data

            return {
                id,
                linkName,
                linkType: LinkType.PUBLIC
            }
        } catch (error) {
            if (error.response?.data?.error?.code === 100 && (error?.response?.data?.error?.message as string)?.includes('Unsupported get request. Object with ID')) {
                return {
                    linkType: LinkType.DIE
                }
            }

            return {
                linkType: LinkType.UNDEFINED
            }
        }
    }
}