import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import { Injectable } from '@nestjs/common';
import { ProxyService } from 'src/modules/proxy/proxy.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { extractPhoneNumber, getHttpAgent } from 'src/common/utils/helper';
import { faker } from '@faker-js/faker';
import { TokenService } from 'src/modules/token/token.service';
import { TokenStatus } from 'src/modules/token/entities/token.entity';
import { LinkEntity, LinkType } from 'src/modules/links/entities/links.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IGetCmtPrivateResponse } from './get-comment-private.i';


dayjs.extend(utc);

@Injectable()
export class GetCommentPrivateUseCase {
    fbUrl = 'https://www.facebook.com';
    fbGraphql = `https://www.facebook.com/api/graphql`;

    constructor(private readonly httpService: HttpService,
        private proxyService: ProxyService,
        private tokenService: TokenService,
        @InjectRepository(LinkEntity)
        private linkRepository: Repository<LinkEntity>,
    ) { }


    async getCommentPrivate(postId: string): Promise<IGetCmtPrivateResponse | null> {
        const proxy = await this.proxyService.getRandomProxy()
        const token = await this.tokenService.getTokenCrawCmtActiveFromDb()
        try {
            if (!proxy || !token) {
                return null
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

            const params = {
                "order": "reverse_chronological",
                "limit": "1000",
                "access_token": token.tokenValue,
                "created_time": "created_time"
            }


            const dataCommentToken = await firstValueFrom(
                this.httpService.get(`https://graph.facebook.com/${postId}/comments`, {
                    headers,
                    httpsAgent,
                    params
                }),
            );
            const res = dataCommentToken.data?.data.length > 0 ? dataCommentToken.data?.data[0] : null
            return {
                hasData: !!dataCommentToken.data?.data,
                data: res ? {
                    commentId: btoa(encodeURIComponent(`comment:${res?.id}`)),
                    userNameComment: res?.from?.name,
                    commentMessage: res?.message,
                    phoneNumber: extractPhoneNumber(res?.message),
                    userIdComment: res?.from?.id,
                    commentCreatedAt: dayjs(res?.created_time).utc().format('YYYY-MM-DD HH:mm:ss')
                } : null
            }
        } catch (error) {
            console.log("🚀 ~ GetCommentPrivateUseCase ~ getCommentPrivate ~ error:", error.message)
            if (error.response?.data?.error?.code === 100 && (error?.response?.data?.error?.message as string)?.includes('Unsupported get request. Object with ID')) {
                const link = await this.linkRepository.findOne({
                    where: {
                        postId
                    }
                })

                await this.linkRepository.save({ ...link, type: LinkType.DIE })
            }

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
                if (error.response?.data?.error?.code === 100 && (error?.response?.data?.error?.message as string)?.includes('Unsupported get request. Object with ID')) {
                    const link = await this.linkRepository.findOne({
                        where: {
                            postId
                        }
                    })

                    await this.linkRepository.save({ ...link, type: LinkType.DIE })

                }
                if (error.response?.data?.error?.code === 10) {
                    await this.tokenService.updateStatusToken(token, TokenStatus.DIE)
                }
            }
        }

    }
}