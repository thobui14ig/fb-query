/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AxiosRequestConfig } from 'axios';
import * as dayjs from 'dayjs';
import * as timezone from 'dayjs/plugin/timezone';
import * as utc from 'dayjs/plugin/utc';
import { firstValueFrom } from 'rxjs';
import { isNumeric } from 'src/common/utils/check-utils';
import { extractPhoneNumber } from 'src/common/utils/helper';
import { Repository } from 'typeorm';
import { CookieEntity, CookieStatus } from '../cookie/entities/cookie.entity';
import { LinkEntity, LinkType } from '../links/entities/links.entity';
import { TokenEntity, TokenStatus } from '../token/entities/token.entity';
import {
  getBodyComment,
  getBodyToken,
  getHeaderComment,
  getHeaderProfileFb,
  getHeaderProfileLink,
  getHeaderToken,
} from './utils';
import { ProxyEntity, ProxyStatus } from '../proxy/entities/proxy.entity';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { faker } from '@faker-js/faker';
import { v4 as uuidv4 } from 'uuid';

dayjs.extend(utc);
// dayjs.extend(timezone);

@Injectable()
export class FacebookService {
  appId = '256002347743983';
  fbUrl = 'https://www.facebook.com';
  fbGraphql = `https://www.facebook.com/api/graphql`;
  ukTimezone = 'Asia/Bangkok';

  constructor(private readonly httpService: HttpService,
    @InjectRepository(TokenEntity)
    private tokenRepository: Repository<TokenEntity>,
    @InjectRepository(CookieEntity)
    private cookieRepository: Repository<CookieEntity>,
    @InjectRepository(ProxyEntity)
    private proxyRepository: Repository<ProxyEntity>,
    @InjectRepository(LinkEntity)
    private linkRepository: Repository<LinkEntity>
  ) { }

  async getDataProfileFb(
    cookie: string,
  ): Promise<{ login: boolean; accessToken?: string }> {
    const cookies = this.changeCookiesFb(cookie);
    const headers = getHeaderProfileFb();
    const config: AxiosRequestConfig = {
      headers,
      withCredentials: true,
      timeout: 30000,
    };

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

      const cleanedText = responseText.replace(/\[\]/g, '');
      const match = cleanedText.match(/LSD",,{"token":"(.+?)"/);

      const lsd = match ? match[1] : null;
      const cUser = cookies['c_user'];
      const accessToken = await this.getToken(
        fbDtsg,
        lsd,
        cookies,
        cUser,
        this.appId,
      );

      return { login: true, accessToken: accessToken };
    } catch (error) {
      console.log("🚀 ~ error:", error)
      return { login: false };
    }
  }

  private changeCookiesFb(cookies: string): Record<string, string> {
    cookies = cookies.trim().replace(/;$/, '');
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

  async getCmtPublic(postId: string, proxy: ProxyEntity, cookie: CookieEntity) {
    console.log("🚀 ~ getCmtPublic ~ getCmtPublic:", postId)
    const httpsAgent = this.getHttpAgent(proxy)
    const headers = getHeaderComment(this.fbUrl);
    const body = getBodyComment(postId);

    try {
      const response = await firstValueFrom(
        this.httpService.post(this.fbGraphql, body, {
          headers,
          httpsAgent
        }),
      )

      let { commentId,
        userNameComment,
        commentMessage,
        phoneNumber,
        userIdComment,
        commentCreatedAt, } = await this.handleDataComment(response, proxy, cookie)

      const res = {
        commentId,
        userNameComment,
        commentMessage,
        phoneNumber,
        userIdComment,
        commentCreatedAt,
      };

      return res;
    } catch (error) {
      console.log("🚀 ~ getCmtPublic ~ error:", error?.message)
      if ((error?.message as string).includes('connect ETIMEDOUT') || (error?.message as string).includes('connect ECONNREFUSED')) {
        await this.updateProxyDie(proxy)
        return
      }

      return
    }
  }

  async getCommentByToken(postId: string, proxy: ProxyEntity, token: TokenEntity) {
    console.log("🚀 ~ getCommentByToken ~ postId:", postId)
    try {

      const languages = [
        'en-US,en;q=0.9',
        'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7'
      ];

      const userAgent = faker.internet.userAgent()
      const apceptLanguage = languages[Math.floor(Math.random() * languages.length)]
      const httpsAgent = this.getHttpAgent(proxy)

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
      const res = dataCommentToken.data?.data[0]

      return {
        commentId: btoa(encodeURIComponent(`comment:${res?.id}`)),
        userNameComment: res?.from?.name,
        commentMessage: res?.message,
        phoneNumber: extractPhoneNumber(res?.message),
        userIdComment: res?.from?.id,
        commentCreatedAt: dayjs(res?.created_time).utc().format('YYYY-MM-DD HH:mm:ss')
      }
    } catch (error) {
      console.log("🚀 ~ getCommentByToken ~ error:", error?.message)
      if ((error?.message as string).includes('connect ETIMEDOUT') || (error?.message as string).includes('connect ECONNREFUSED')) {
        await this.updateProxyDie(proxy)
      }
      if ((error?.response?.data?.error?.message as string).includes('Unsupported get request. Object with ID')) {
        await this.updateLinkPostIdInvalid(postId)
        return
      }
      if (error?.response?.status == 400) {
        await this.updateTokenDie(token)
      }

      return {}
    }
  }

  async handleDataComment(response, proxy: ProxyEntity, cookie: CookieEntity) {
    const comment =
      response?.data?.data?.node?.comment_rendering_instance_for_feed_location
        ?.comments.edges?.[0]?.node;
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
    userIdComment = isNumeric(userIdComment) ? userIdComment : await this.getUuidByCookie(comment?.author.id, proxy, cookie)

    return {
      commentId,
      userNameComment,
      commentMessage,
      phoneNumber,
      userIdComment,
      commentCreatedAt,
    };
  }

  async getProfileLink(url: string, proxy: ProxyEntity) {
    try {
      const httpsAgent = this.getHttpAgent(proxy)
      console.log("----------Đang lấy thông tin url:", url)
      const { cookies, headers } = getHeaderProfileLink()

      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: { ...headers, Cookie: this.formatCookies(cookies) },
          httpsAgent,
        }),
      );
      const htmlContent = response.data
      const match = htmlContent.match(/,"actors":(\[.*?\])/);
      //case 1
      if (match && match[1]) {
        console.log("🚀 ~ getProfileLink ~ match[1]:", match[1])
        const postId = htmlContent?.split('"post_id":"')[1]?.split('"')[0];
        const profileDecode = JSON.parse(match[1])
        if (postId) {
          return {
            type: LinkType.PUBLIC,
            name: profileDecode[0]?.name ?? url,
            postId: postId,
          }
        }
      }
      //case 2: video
      const match1 = htmlContent.match(/"video_id":"(.*?)"/);
      if (match && match1[1]) {
        console.log("🚀 ~ getProfileLink ~ match1[1]:", match1[1])
        const postId = match1[1]
        return {
          type: LinkType.PRIVATE,
          name: url,
          postId: postId,
        }
      }

      return {
        type: LinkType.PRIVATE,
      }
    } catch (error) {
      console.log("Lỗi lấy thông tin bài viết ", error)
      return {
        type: LinkType.PRIVATE,
      }
    }
  }

  // async getProfileUserByUuid(name: string, uuid: string, httpsAgent) {
  //   const dataUser = await firstValueFrom(
  //     this.httpService.get(`https://www.facebook.com/people/${name}/${uuid}`, {
  //       headers: {
  //         "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  //         "accept-language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
  //         "cache-control": "max-age=0",
  //         "cookie": "datr=nSR2Z_oJHz-4IM1RO18kh-7-; sb=nSR2Z3jWL2LzGxQFb8Hh5zmI; dpr=1.25; ps_l=1; ps_n=1; fr=0tNBmTCvSwJfOacCc..Bneanz..AAA.0.0.Bneaq3.AWWizVfr1ZQ; wd=816x703",
  //         "dpr": "1.25",
  //         "priority": "u=0, i",
  //         "sec-ch-prefers-color-scheme": "light",
  //         "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  //         "sec-ch-ua-full-version-list": '"Google Chrome";v="131.0.6778.205", "Chromium";v="131.0.6778.205", "Not_A Brand";v="24.0.0.0"',
  //         "sec-ch-ua-mobile": "?0",
  //         "sec-ch-ua-model": "",
  //         "sec-ch-ua-platform": "Windows",
  //         "sec-ch-ua-platform-version": "8.0.0",
  //         "sec-fetch-dest": "document",
  //         "sec-fetch-mode": "navigate",
  //         "sec-fetch-site": "none",
  //         "sec-fetch-user": "?1",
  //         "upgrade-insecure-requests": "1",
  //         "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  //         "viewport-width": "816"
  //       },
  //       httpsAgent
  //     }),
  //   );
  //   const match = dataUser.data.match(/fb:\/\/profile\/(\d+)/);

  //   if (match && match[1]) {
  //     console.log("🚀 ~ getProfileUserByUuid ~ match:", match[1])
  //     const userId = match[0].split("fb://profile/")[1].split('"')[0]
  //     return userId
  //   }

  //   return null
  // }

  // async getInfoAccountsByCookie(httpsAgent, cookie) {
  //   const cookies = this.changeCookiesFb(cookie);
  //   const dataUser = await firstValueFrom(
  //     this.httpService.get('https://www.facebook.com', {
  //       headers: {
  //         Cookie: this.formatCookies(cookies)
  //       },
  //       httpsAgent
  //     }),
  //   );

  //   const dtsgMatch = dataUser.data.match(/DTSGInitialData",\[\],{"token":"(.*?)"}/);
  //   const jazoestMatch = dataUser.data.match(/&jazoest=(.*?)"/);
  //   const userIdMatch = dataUser.data.match(/"USER_ID":"(.*?)"/);

  //   if (dtsgMatch && jazoestMatch && userIdMatch) {
  //     const fbDtsg = dtsgMatch[1];
  //     const jazoest = jazoestMatch[1];
  //     const facebookId = userIdMatch[1];

  //     return { fbDtsg, jazoest, facebookId }
  //   }
  // }

  async getUuidByCookie(uuid: string, proxy: ProxyEntity, cookieEntity: CookieEntity) {
    try {
      const httpsAgent = this.getHttpAgent(proxy)
      const cookies = this.changeCookiesFb(cookieEntity.cookie);
      const dataUser = await firstValueFrom(
        this.httpService.get(`https://www.facebook.com/${uuid}`, {
          headers: {
            Cookie: this.formatCookies(cookies)
          },
          httpsAgent
        }),
      );

      const html = dataUser.data
      const match = html.match(/"userID"\s*:\s*"(\d+)"/);
      if (match) {
        const userID = match[1];
        console.log("🚀 ~ getUuidByCookie ~ userID:", userID)
        return userID
      }
      return null
    } catch (error) {
      console.log("🚀 ~ getUuidByCookie ~ error:", error?.message)
      if ((error?.message as string).includes('connect ETIMEDOUT') || (error?.message as string).includes('connect ECONNREFUSED')) {
        await this.updateProxyDie(proxy)

        return
      }
      await this.updateCookieDie(cookieEntity)
      return null
    }
  }

  // getCommentByCookie() {
  // const cookie = `fr=09Oi55QtN1FWwNy4O.AWf4VuytTZ4thllQVja-_HgKa1hDNUf6aZV6TWe8-zXuvGbdk8w.BoDclZ..AAA.0.0.BoDclt.AWf8oEN13t-Thok6uPGAX59L874;c_user=61575338380915;xs=23%3ArWsaFthQ78yaug%3A2%3A1745733995%3A-1%3A-1;presence=C%7B%22t3%22%3A%5B%5D%2C%22utc3%22%3A1745734003338%2C%22v%22%3A1%7D;wd=383x491;sb=WckNaI9fnGyYgbWPDj9kgyHs;datr=WckNaMY9vCqr-QDAHQQdr6mD;`
  // const { facebookId, fbDtsg, jazoest } = await this.getInfoAccountsByCookie(httpsAgent, cookie)


  // const data = {
  //   av: facebookId,
  //   __aaid: "0",
  //   __user: facebookId,
  //   __a: "1",
  //   __req: "17",
  //   __hs: "20083.HYP:comet_loggedout_pkg.2.1.0.0.0",
  //   dpr: "1",
  //   __ccg: "EXCELLENT",
  //   __rev: "1019077343",
  //   __s: "ew02ta:bsck7x:9vkuon",
  //   __hsi: "7452585136370389220",
  //   fb_dtsg: fbDtsg,
  //   jazoest: jazoest,
  //   __comet_req: "15",
  //   lsd: "AVpOnNuOsK0",
  //   __spin_r: "1019077343",
  //   __spin_b: "trunk",
  //   fb_api_caller_class: "RelayModern",
  //   fb_api_req_friendly_name: "CommentListComponentsRootQuery",
  //   variables: JSON.stringify({
  //     commentsIntentToken: "RECENT_ACTIVITY_INTENT_V1",
  //     feedLocation: "PERMALINK",
  //     feedbackSource: 2,
  //     focusCommentID: null,
  //     scale: 1,
  //     useDefaultActor: false,
  //     id: postId,
  //     __relay_internal__pv__IsWorkUserrelayprovider: false
  //   }),
  //   server_timestamps: "true",
  //   doc_id: "9051058151623566"
  // };
  // const ck = this.changeCookiesFb(cookie)

  // const test = await firstValueFrom(
  //   this.httpService.post('https://www.facebook.com/api/graphql/', data, {
  //     httpsAgent,
  //     headers: {
  //       'content-type': 'application/x-www-form-urlencoded',
  //       'Cookie': this.formatCookies(ck), // nếu cần auth
  //       // Các headers khác nếu Facebook yêu cầu
  //     }
  //   }),
  // );
  // console.log("🚀 ~ getCmt ~ test:", test)
  // writeFile(test.data, '222')
  // }

  updateTokenDie(token: TokenEntity) {
    console.log("🚀 ~ updateTokenDie ~ token:", token)
    return this.tokenRepository.save({ ...token, status: TokenStatus.DIE })
  }

  updateCookieDie(cookie: CookieEntity) {
    console.log("🚀 ~ updateCookieDie ~ cookie:", cookie)
    return this.cookieRepository.save({ ...cookie, status: CookieStatus.DIE })
  }

  updateProxyDie(proxy: ProxyEntity) {
    console.log("🚀 ~ updateProxyDie ~ proxy:", proxy)
    return this.proxyRepository.save({ ...proxy, status: ProxyStatus.IN_ACTIVE })
  }

  async updateLinkPostIdInvalid(postId: string) {
    console.log("🚀 ~ updateLinkPostIdInvalid ~ updateLinkPostIdInvalid:", postId, "Does not exit")
    const links = await this.linkRepository.find({
      where: {
        postId
      }
    })

    return this.linkRepository.save(links.map((item) => {
      return {
        ...item,
        errorMessage: `PostId: ${postId} NotFound.`
      }
    }))
  }

  getHttpAgent(proxy: ProxyEntity) {
    const proxyArr = proxy?.proxyAddress.split(':')
    const agent = `http://${proxyArr[2]}:${proxyArr[3]}@${proxyArr[0]}:${proxyArr[1]}`
    const httpsAgent = new HttpsProxyAgent(agent);

    return httpsAgent;
  }
}
