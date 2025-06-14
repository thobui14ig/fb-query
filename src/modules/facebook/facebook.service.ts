/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { faker } from '@faker-js/faker';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { AxiosRequestConfig } from 'axios';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { firstValueFrom } from 'rxjs';
import { extractFacebookId } from 'src/common/utils/helper';
import { In, IsNull, Not, Repository } from 'typeorm';
import { CommentEntity } from '../comments/entities/comment.entity';
import { CookieEntity, CookieStatus } from '../cookie/entities/cookie.entity';
import { LinkEntity, LinkStatus, LinkType } from '../links/entities/links.entity';
import { ProxyEntity, ProxyStatus } from '../proxy/entities/proxy.entity';
import { DelayEntity } from '../setting/entities/delay.entity';
import { TokenEntity, TokenHandle, TokenStatus, TokenType } from '../token/entities/token.entity';
import { GetCommentPrivateUseCase } from './usecase/get-comment-private/get-comment-private';
import { GetCommentPublicUseCase } from './usecase/get-comment-public/get-comment-public';
import { GetInfoLinkUseCase } from './usecase/get-info-link/get-info-link';
import { GetUuidUserUseCase } from './usecase/get-uuid-user/get-uuid-user';
import { HideCommentUseCase } from './usecase/hide-comment/hide-comment';
import {
  getBodyToken,
  getHeaderProfileFb,
  getHeaderToken
} from './utils';

dayjs.extend(utc);
// dayjs.extend(timezone);

@Injectable()
export class FacebookService {
  // appId = '256002347743983';
  appId = '6628568379'
  fbUrl = 'https://www.facebook.com';
  fbGraphql = `https://www.facebook.com/api/graphql`;
  ukTimezone = 'Asia/Bangkok';
  browser = null

  constructor(private readonly httpService: HttpService,
    @InjectRepository(TokenEntity)
    private tokenRepository: Repository<TokenEntity>,
    @InjectRepository(CookieEntity)
    private cookieRepository: Repository<CookieEntity>,
    @InjectRepository(ProxyEntity)
    private proxyRepository: Repository<ProxyEntity>,
    @InjectRepository(LinkEntity)
    private linkRepository: Repository<LinkEntity>,
    @InjectRepository(CommentEntity)
    private commentRepository: Repository<CommentEntity>,
    @InjectRepository(DelayEntity)
    private delayRepository: Repository<DelayEntity>,
    private getInfoLinkUseCase: GetInfoLinkUseCase,
    private getCommentPublicUseCase: GetCommentPublicUseCase,
    private getCommentPrivateUseCase: GetCommentPrivateUseCase,
    private getUuidUserUseCase: GetUuidUserUseCase,
    private hideCommentUseCase: HideCommentUseCase,
  ) {
  }

  getAppIdByTypeToken(type: TokenType) {
    if (type === TokenType.EAADo1) {
      return '256002347743983'
    }

    if (type === TokenType.EAAAAAY) {
      return '6628568379'
    }

    return '256002347743983'
  }

  async getDataProfileFb(
    cookie: string,
    type: TokenType
  ): Promise<{ login: boolean; accessToken?: string }> {
    const cookies = this.changeCookiesFb(cookie);
    const headers = getHeaderProfileFb();
    const config: AxiosRequestConfig = {
      headers,
      withCredentials: true,
      timeout: 30000,
    };
    const appId = this.getAppIdByTypeToken(type)

    try {
      const response = await firstValueFrom(
        this.httpService.get(this.fbUrl, {
          ...config,
          headers: { ...config.headers, Cookie: this.formatCookies(cookies) },
        }),
      );

      const responseText: string = response.data as string;
      const idUserMatch = responseText.match(/"USER_ID":"([^"]*)"/);
      const idUser = idUserMatch ? idUserMatch[1] : null;
      if (idUser === '0') {
        return { login: false };
      }

      const fbDtsgMatch = responseText.match(/"f":"([^"]*)","l/);
      const fbDtsg = fbDtsgMatch ? fbDtsgMatch[1] : null;

      const cleanedText = responseText?.replace(/\[\]/g, '');
      const match = cleanedText.match(/LSD",,{"token":"(.+?)"/);

      const lsd = match ? match[1] : null;
      const cUser = cookies['c_user'];
      const accessToken = await this.getToken(
        fbDtsg,
        lsd,
        cookies,
        cUser,
        appId,
      );

      return { login: true, accessToken: accessToken };
    } catch (error) {
      console.log("🚀 ~ error:", error?.message)
      return { login: false };
    }
  }

  private changeCookiesFb(cookies: string): Record<string, string> {
    cookies = cookies.trim()?.replace(/;$/, '');
    const result = {};

    try {
      cookies
        .trim()
        .split(';')
        .forEach((item) => {
          const parts = item.trim().split('=');
          if (parts.length === 2) {
            result[parts[0]] = parts[1];
          }
        });
      return result;
    } catch (_e) {
      cookies
        .trim()
        .split('; ')
        .forEach((item) => {
          const parts = item.trim().split('=');
          if (parts.length === 2) {
            result[parts[0]] = parts[1];
          }
        });
      return result;
    }
  }

  private formatCookies(cookies: Record<string, string>): string {
    return Object.entries(cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  }

  private async getToken(
    fbDtsg: string,
    lsd: string,
    cookies: Record<string, string>,
    cUser: string,
    appId: string,
  ) {
    const headers = getHeaderToken(this.fbUrl);
    const body = getBodyToken(cUser, fbDtsg, appId);
    const config: AxiosRequestConfig = {
      headers,
      withCredentials: true,
      timeout: 30000,
    };

    const response = await firstValueFrom(
      this.httpService.post(this.fbGraphql, body, {
        ...config,
        headers: { ...config.headers, Cookie: this.formatCookies(cookies) },
      }),
    );

    const uri = response.data?.data?.run_post_flow_action?.uri;
    if (!uri) return null;

    const parsedUrl = new URL(uri as string);
    const closeUri = parsedUrl.searchParams.get('close_uri');
    if (!closeUri) return null;

    const decodedCloseUri = decodeURIComponent(closeUri);
    const fragment = new URL(decodedCloseUri).hash.substring(1); // remove the '#'
    const fragmentParams = new URLSearchParams(fragment);

    const accessToken = fragmentParams.get('access_token');
    return accessToken ?? null;
  }

  async getCmtPublic(postIdStr: string, postId) {
    const commentsRes = await this.getCommentPublicUseCase.getCmtPublic(postIdStr)
    if (!commentsRes) {//hết proxy or token
      return null
    }

    return commentsRes.data
  }

  handleCookie(rawCookie) {
    // Danh sách các key cookie cần giữ lại và theo thứ tự mong muốn
    const keysOrder = ['fr', 'c_user', 'datr', 'sb', 'presence', 'wd', 'xs', 'ps_n', 'ps_l'];

    // Chuyển cookie thành object
    const cookieObj = Object.fromEntries(
      rawCookie.split('; ').map(pair => {
        const [key, ...val] = pair.split('=');
        return [key, val.join('=')];
      })
    );

    // Lọc và sắp xếp cookie
    const filteredSortedCookie = keysOrder
      .filter(key => cookieObj[key] !== undefined)
      .map(key => `${key}=${cookieObj[key]}`)
      .join('; ');

    return filteredSortedCookie
  }

  async getCommentByToken(postId: string) {
    const commentsRes = await this.getCommentPrivateUseCase.getCommentPrivate(postId)
    if (!commentsRes) {//hết proxy or token
      return null
    }

    return commentsRes.data
  }

  async getProfileLink(url: string, id: number) {
    // console.log("----------Đang lấy thông tin url:", url, id);

    const postId = extractFacebookId(url);
    if (!postId) return { type: LinkType.UNDEFINED };

    const info = await this.getInfoLinkUseCase.getInfoLink(postId);
    if (!info?.id) {
      return { type: info?.linkType ?? LinkType.UNDEFINED };
    }

    const cmtResponse = await this.getCommentPublicUseCase.getCmtPublic(info.id, true);
    if (!cmtResponse) return { type: LinkType.UNDEFINED };

    const baseInfo = {
      name: info.linkName,
      postId: info.id,
    };

    if (cmtResponse.hasData) {
      return {
        type: LinkType.PUBLIC,
        ...baseInfo,
      };
    }

    return {
      type: LinkType.PRIVATE,
      ...baseInfo,
      pageId: info.pageId,
    };
  }

  async getCountLikePublic(url: string) {
    const proxy = await this.getRandomProxy()
    const res = {
      totalCount: null,
      totalLike: null
    }

    try {
      if (!proxy) {
        return res
      }
      const httpsAgent = this.getHttpAgent(proxy)
      const response = await firstValueFrom(
        this.httpService.get(url, {
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
            "cookie": "sb=IpN2Z63pdgaswLIv6HwTPQe2; ps_l=1; ps_n=1; datr=Xr4NaIxUf5ztTudh--LM1AJd; ar_debug=1; fr=1UkVxZvyucxVG78mk.AWevqY9nf_vHWJzPoe3hBWtadWsJ80XJ0HFGnqPtdNh439ijAVg.BoHzIp..AAA.0.0.BoH3O0.AWfmrWmPXac1pUoDOR6Hlr4s3r0; wd=856x953",
            "Referrer-Policy": "origin-when-cross-origin"
          },
          httpsAgent,
        }),
      );

      const htmlContent = response.data
      const matchLike = htmlContent.match(/"reaction_count":\{"count":(\d+),/);
      if (matchLike && matchLike[1]) {
        res.totalCount = matchLike[1]
      }

      const matchCount = htmlContent.match(/"total_count":(\d+)/);
      if (matchCount && matchCount[1]) {
        res.totalLike = matchCount[1]
      }

      return res
    } catch (error) {
      if ((error?.message as string)?.includes('connect ECONNREFUSED') || error?.status === 407 || (error?.message as string)?.includes('connect EHOSTUNREACH') || (error?.message as string)?.includes('Proxy connection ended before receiving CONNECT')) {
        await this.updateProxyDie(proxy)
      }

      return res
    }
  }

  async checkProxyBlock(proxy: ProxyEntity) {
    try {
      const httpsAgent = this.getHttpAgent(proxy)

      const response = await firstValueFrom(
        this.httpService.get("https://www.facebook.com/630629966359111", {
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
            "cookie": "sb=IpN2Z63pdgaswLIv6HwTPQe2; ps_l=1; ps_n=1; datr=Xr4NaIxUf5ztTudh--LM1AJd; ar_debug=1; fr=1UkVxZvyucxVG78mk.AWevqY9nf_vHWJzPoe3hBWtadWsJ80XJ0HFGnqPtdNh439ijAVg.BoHzIp..AAA.0.0.BoH3O0.AWfmrWmPXac1pUoDOR6Hlr4s3r0; wd=856x953",
            "Referrer-Policy": "origin-when-cross-origin"
          },
          httpsAgent,
        }),
      );
      const htmlContent = response.data
      const isBlockProxy = (htmlContent as string).includes('Temporarily Blocked')

      if (isBlockProxy) {
        return true
      }

      const isCookieDie = (htmlContent as string).includes('You must log in to continue')
      if (isCookieDie) {
        return true
      }


      return false
    } catch (error) {
      return true
    }
  }

  async getPostIdPublicV2(url: string) {
    try {
      const proxy = await this.getRandomProxy()
      const httpsAgent = this.getHttpAgent(proxy)

      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "accept-language": "en-US,en;q=0.9,vi;q=0.8",
            "cache-control": "max-age=0",
            "dpr": "1",
            "priority": "u=0, i",
            "sec-ch-prefers-color-scheme": "light",
            "sec-ch-ua": "\"Google Chrome\";v=\"135\", \"Not-A.Brand\";v=\"8\", \"Chromium\";v=\"135\"",
            "sec-ch-ua-full-version-list": "\"Google Chrome\";v=\"135.0.7049.116\", \"Not-A.Brand\";v=\"8.0.0.0\", \"Chromium\";v=\"135.0.7049.116\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-model": "\"\"",
            "sec-ch-ua-platform": "\"Windows\"",
            "sec-ch-ua-platform-version": "\"10.0.0\"",
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "same-origin",
            "sec-fetch-user": "?1",
            "upgrade-insecure-requests": "1",
            "viewport-width": "856"
          },
          httpsAgent,
        }),
      );
      const htmlContent = response.data
      const match = htmlContent.match(/"subscription_target_id":"(.*?)"/);
      if (match && match[1]) {
        const postId = match[1]
        console.log("🚀 ~ getPostIdPublicV2 ~ match:", postId)
        if (postId) {
          return postId
        }
      }

      const matchV1 = htmlContent.match(/"post_id":"(.*?)"/);

      if (matchV1 && matchV1[1]) {
        const postId = matchV1[1]
        console.log("🚀 ~ getPostIdPublicV2 ~ match:", postId)
        if (postId) {
          return postId
        }
      }

      return null
    } catch (error) {
      console.log("🚀 ~ getPostIdPublicV2 ~ error:", error.message)
      return null
    }
  }

  async getPostIdV2WithCookie(url: string) {
    try {
      const proxy = await this.getRandomProxy()
      const httpsAgent = this.getHttpAgent(proxy)
      const cookieEntity = await this.getCookieActiveOrLimitFromDb()
      if (!cookieEntity) return null
      const cookies = this.changeCookiesFb(cookieEntity.cookie)

      const response = await firstValueFrom(
        this.httpService.get(url, {
          "headers": {
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "accept-language": "en-US,en;q=0.9,vi;q=0.8",
            "dpr": "1",
            "priority": "u=0, i",
            "sec-ch-prefers-color-scheme": "light",
            "sec-ch-ua": "\"Google Chrome\";v=\"135\", \"Not-A.Brand\";v=\"8\", \"Chromium\";v=\"135\"",
            "sec-ch-ua-full-version-list": "\"Google Chrome\";v=\"135.0.7049.116\", \"Not-A.Brand\";v=\"8.0.0.0\", \"Chromium\";v=\"135.0.7049.116\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-model": "\"\"",
            "sec-ch-ua-platform": "\"Windows\"",
            "sec-ch-ua-platform-version": "\"10.0.0\"",
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "same-origin",
            "upgrade-insecure-requests": "1",
            "viewport-width": "856",
            "cookie": this.formatCookies(cookies),
            "Referrer-Policy": "strict-origin-when-cross-origin"
          },
          httpsAgent,
        }),
      );

      const match = response.data.match(/"post_id":"(.*?)"/);

      if (match && match[1]) {
        return match[1]
      }

      return null
    } catch (error) {
      console.log("🚀 ~ getPostIdV2 ~ error:", error.message)
      return null
    }
  }

  async getInfoAccountsByCookie(cookie: string) {
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const proxy = await this.getRandomProxy();
        if (!proxy) return null
        const httpsAgent = this.getHttpAgent(proxy);
        const cookies = this.changeCookiesFb(cookie);

        const dataUser = await firstValueFrom(
          this.httpService.get('https://www.facebook.com', {
            headers: {
              Cookie: this.formatCookies(cookies),
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

  async getTotalCountWithToken(link: LinkEntity) {
    const proxy = await this.getRandomProxy()
    const token = await this.getTokenGetInfoActiveFromDb()
    try {

      if (!proxy || !token) { return null }

      const httpsAgent = this.getHttpAgent(proxy)
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
      const id = `${link.pageId}_${link.postId}`

      const dataCommentToken = await firstValueFrom(
        this.httpService.get(`https://graph.facebook.com/${id}?fields=comments.summary(count),reactions.summary(total_count)&access_token=${token.tokenValueV1}`, {
          headers,
          httpsAgent
        }),
      );
      const { comments, reactions } = dataCommentToken.data || {}
      const totalCountLike = reactions?.summary?.total_count
      const totalCountCmt = comments?.count

      return {
        totalCountLike, totalCountCmt
      }
    } catch (error) {
      if (error.response?.data?.error?.code === 190) {
        await this.updateStatusTokenDie(token, TokenStatus.DIE)
      }
    }

  }

  updateStatusTokenDie(token: TokenEntity, status: TokenStatus) {
    console.log("🚀 ~ updateTokenDie ~ token:", token)
    return this.tokenRepository.save({ ...token, status })
  }

  updateStatusCookie(cookie: CookieEntity, status: CookieStatus, message?: string) {
    console.log(`🚀 ~ updateStatusCookie ~ cookie: ${status}`, cookie, message)
    return this.cookieRepository.save({ ...cookie, status })
  }

  updateProxyDie(proxy: ProxyEntity) {
    return this.proxyRepository.save({ ...proxy, status: ProxyStatus.IN_ACTIVE })
  }

  updateProxyFbBlock(proxy: ProxyEntity) {
    return this.proxyRepository.save({ ...proxy, isFbBlock: true })
  }

  updateProxyActive(proxy: ProxyEntity) {
    return this.proxyRepository.save({ ...proxy, status: ProxyStatus.ACTIVE, isFbBlock: false })
  }

  async updateLinkPostIdInvalid(postId: string) {
    const links = await this.linkRepository.find({
      where: {
        postId,
        lastCommentTime: IsNull()
      }
    })

    return this.linkRepository.save(links.map((item) => {
      return {
        ...item,
        errorMessage: `PostId: ${postId} NotFound.`,
        type: LinkType.DIE
      }
    }))
  }

  getHttpAgent(proxy: ProxyEntity) {
    const proxyArr = proxy?.proxyAddress.split(':')
    const agent = `http://${proxyArr[2]}:${proxyArr[3]}@${proxyArr[0]}:${proxyArr[1]}`
    const httpsAgent = new HttpsProxyAgent(agent);

    return httpsAgent;
  }

  async getCookieActiveFromDb(): Promise<CookieEntity> {
    const cookies = await this.cookieRepository.find({
      where: {
        status: In([CookieStatus.INACTIVE, CookieStatus.ACTIVE]),
        user: {
          level: 1
        }
      },
      relations: {
        user: true
      },
    })
    const randomIndex = Math.floor(Math.random() * cookies.length);
    const randomCookie = cookies[randomIndex];

    return randomCookie
  }

  async getCookieActiveOrLimitFromDb(): Promise<CookieEntity> {
    const cookies = await this.cookieRepository.find({
      where: {
        status: In([CookieStatus.INACTIVE, CookieStatus.LIMIT, CookieStatus.ACTIVE]),
        user: {
          level: 1
        }
      },
      relations: {
        user: true
      },
    })
    const randomIndex = Math.floor(Math.random() * cookies.length);
    const randomCookie = cookies[randomIndex];

    return randomCookie
  }

  async getTokenActiveFromDb(): Promise<TokenEntity> {
    const tokens = await this.tokenRepository.find({
      where: {
        status: TokenStatus.ACTIVE,
        type: TokenHandle.CRAWL_CMT
      }
    })

    const randomIndex = Math.floor(Math.random() * tokens.length);
    const randomToken = tokens[randomIndex];

    return randomToken
  }

  async getTokenEAAAAAYActiveFromDb(): Promise<TokenEntity> {
    const tokens = await this.tokenRepository.find({
      where: {
        status: In([TokenStatus.LIMIT, TokenStatus.ACTIVE]),
        tokenValueV1: Not(IsNull()),
        type: TokenHandle.CRAWL_CMT

      }
    })

    const randomIndex = Math.floor(Math.random() * tokens.length);
    const randomToken = tokens[randomIndex];

    return randomToken
  }

  async getTokenGetInfoActiveFromDb(): Promise<TokenEntity> {
    const tokens = await this.tokenRepository.find({
      where: {
        status: In([TokenStatus.ACTIVE]),
        tokenValueV1: Not(IsNull()),
        type: TokenHandle.GET_INFO
      }
    })

    const randomIndex = Math.floor(Math.random() * tokens.length);
    const randomToken = tokens[randomIndex];

    return randomToken
  }


  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async updateUUIDUser() {
    const comments = await this.commentRepository.createQueryBuilder('comment')
      .where('comment.uid LIKE :like1', { like1: 'Y29tb%' })
      .orWhere('comment.uid LIKE :like2', { like2: '%pfbid%' })
      .getMany();

    if (!comments.length) return

    for (const comment of comments) {
      let uid = await this.getUuidUserUseCase.getUuidUser(comment.uid)

      if (uid) {
        comment.uid = uid
        await this.commentRepository.save(comment)
      }
    }
  }

  async getRandomProxy() {
    const proxies = await this.proxyRepository.find({
      where: {
        status: ProxyStatus.ACTIVE,
      }
    })
    const randomIndex = Math.floor(Math.random() * proxies.length);
    const randomProxy = proxies[randomIndex];

    return randomProxy
  }


  async getRandomProxyGetProfile() {
    const proxies = await this.proxyRepository.find({
      where: {
        status: ProxyStatus.ACTIVE,
        isFbBlock: false
      }
    })
    const randomIndex = Math.floor(Math.random() * proxies.length);
    const randomProxy = proxies[randomIndex];

    return randomProxy
  }

  parseCookieString(cookieStr: string) {
    return cookieStr.split(';').map(cookie => {
      const [name, ...rest] = cookie.trim().split('=');
      const value = rest.join('=');
      return {
        name,
        value,
        domain: '.facebook.com',
        path: '/',
        httpOnly: false,
        secure: true
      };
    });
  }

  async getDelayTime(status: LinkStatus, type: LinkType) {
    const setting = await this.delayRepository.find()
    return status === LinkStatus.Pending ? setting[0].delayOff * 60 : (type === LinkType.PUBLIC ? setting[0].delayOnPublic : setting[0].delayOnPrivate)
  }

  @OnEvent('hide.cmt')
  async hideCmt(payload: any) {
    for (const comment of payload) {
      const infoComment = await this.commentRepository.findOne({
        where: {
          id: comment.id
        },
        relations: {
          link: {
            keywords: true
          }
        }
      })
      const keywords = infoComment.link.keywords

      if (infoComment.link.hideCmt && !infoComment.hideCmt) {
        await this.hideCommentUseCase.hideComment(infoComment.link.userId, infoComment.link.hideBy, comment, keywords)
      }
    }
  }

  @OnEvent('gen-token-user')
  async genTokenByCookieUser(payload: CookieEntity) {
    const { cookie } = payload
    const profile = await this.getDataProfileFb(cookie, TokenType.EAADo1);
    if (profile.accessToken) {
      payload.token = profile.accessToken

      return await this.cookieRepository.save(payload)
    }
  }
}
