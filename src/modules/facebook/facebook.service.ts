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
import { Not, Repository } from 'typeorm';
import { CookieEntity, CookieStatus } from '../cookie/entities/cookie.entity';
import { LinkEntity, LinkStatus, LinkType } from '../links/entities/links.entity';
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
import { writeFile } from 'src/common/utils/file';

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

      const cleanedText = responseText?.replace(/\[\]/g, '');
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

  async getCmtPublic(postId: string, proxy: ProxyEntity, type = 'RECENT_ACTIVITY_INTENT_V1') {
    console.log("🚀 ~ getCmtPublic ~ getCmtPublic:", postId)
    const httpsAgent = this.getHttpAgent(proxy)
    const headers = getHeaderComment(this.fbUrl);
    const body = getBodyComment(postId, type);

    try {
      const response = await firstValueFrom(
        this.httpService.post(this.fbGraphql, body, {
          headers,
          httpsAgent
        }),
      )

      let dataComment = await this.handleDataComment(response, proxy)
      if (!dataComment) {
        return this.getCmtPublic(postId, proxy, 'CHRONOLOGICAL_UNFILTERED_INTENT_V1')
      }

      const { commentId,
        userNameComment,
        commentMessage,
        phoneNumber,
        userIdComment,
        commentCreatedAt, } = dataComment


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
      if ((error?.message as string)?.includes('connect ETIMEDOUT') || (error?.message as string)?.includes('connect ECONNREFUSED')) {
        await this.updateProxyDie(proxy)
        return
      }

      return
    }
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

  async getCommentByToken(postId: string, proxy: ProxyEntity, token: TokenEntity) {
    console.log("🚀 ~ getCommentByToken ~ postId:", postId)
    try {
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
      if (!res?.message?.length) return

      return {
        commentId: btoa(encodeURIComponent(`comment:${res?.id}`)),
        userNameComment: res?.from?.name,
        commentMessage: res?.message,
        phoneNumber: extractPhoneNumber(res?.message),
        userIdComment: res?.from?.id,
        commentCreatedAt: dayjs(res?.created_time).utc().format('YYYY-MM-DD HH:mm:ss')
      }
    } catch (error) {
      console.log("🚀 ~ getCommentByToken ~ error:", error.message)
      if ((error?.message as string)?.includes('connect ETIMEDOUT') || (error?.message as string)?.includes('connect ECONNREFUSED')) {
        await this.updateProxyDie(proxy)
      }
      if ((error?.response?.data?.error?.message as string)?.includes('Unsupported get request. Object with ID')) {
        return
      }
      if (error?.response?.status == 400) {
        if (error.response?.data?.error?.code === 368) {
          await this.updateStatusTokenDie(token, TokenStatus.LIMIT)
        }
        if (error.response?.data?.error?.code === 190) {
          await this.updateStatusTokenDie(token, TokenStatus.DIE)
        }
      }

      return {}
    }
  }

  async getCommentByCookie(proxy: ProxyEntity, postId: string) {
    console.log("🚀 ~ getCommentByCookie ~ getCommentByCookie:", postId)
    const cookieEntity = await this.getCookieActiveFromDb()
    if (!cookieEntity) return null
    try {
      const id = `feedback:${postId}`;
      const encodedPostId = Buffer.from(id, 'utf-8').toString('base64');
      const httpsAgent = this.getHttpAgent(proxy)

      const { facebookId, fbDtsg, jazoest } = await this.getInfoAccountsByCookie(httpsAgent, cookieEntity.cookie) || {}

      if (!facebookId) {
        await this.updateStatusCookieDie(cookieEntity, CookieStatus.DIE)

        return null
      }
      const cookies = this.changeCookiesFb(cookieEntity.cookie)

      const data = {
        av: facebookId,
        __aaid: '0',
        __user: facebookId,
        __a: '1',
        __req: '13',
        __hs: '20209.HYP:comet_pkg.2.1...0',
        dpr: '1',
        __ccg: 'EXCELLENT',
        __rev: '1022417048',
        __s: '5j9f2a:6aicy4:1wsr8e',
        __hsi: '7499382864565808594',
        __dyn: '7xeUmwlEnwn8yEqxemh0no6u5U4e1Nxt3odEc8co2qwJyE24wJwpUe8hw2nVE4W0qa321Rw8G11wBz83WwgEcEhwGwQw9m1YwBgao6C0Mo2swlo5qfK0zEkxe2GewbS2SU4i5oe85nxm16waCm260lCq2-azo3iwPwbS16xi4UdUcobUak0KU566E6C13G1-wkE627E4-8wLwHwea',
        __csr: 'gjMVMFljjPl5OqmDuAXRlAp4L9ZtrQiQb-eypFUB4gyaCiC_xHz9KGDgKboJ2ErBgSvxym5EjyFayVVXUSiEC9Bz-qGDyuu6GgzmaHUmBBDK5GGaUpy8J4CxmcwxUjx20Q87207qA59kRQQ0gd0jA0sHwcW02Jq0c7Q0ME0jNweJ0bqE2Bw28WU0z2E7q0iW6U3yw2kE0p762U03jSwHw7Oo0gfm2C0WFOiw33o9S1mw5Owbq0uW0qWfwJylg35wBw9208qwWo1960dKw6Nw30QU225VHmg905lCabzE3Axmi0Jpk0Uo27xq0P41TzoC0ge0N9o0tyw9Ci3m0Qo2bKjO082hwSwpk2O3K6Q0ruz011a034Yw35w37o1rOwnU460cPw9J2oF3o3Yg1ho3vwnA9yAdDo3mg0zxw26Gxt1G4E3qw4FwjobE0Kq1-xWaQ0g-aOwOw4Hoog1bU0L20oO08Cw',
        __comet_req: '15',
        fb_dtsg: fbDtsg,
        jazoest: jazoest,
        lsd: 'AVrkziLMLUQ',
        __spin_r: '1022417048',
        __spin_b: 'trunk',
        __spin_t: '1746086138',
        __crn: 'comet.fbweb.CometTahoeRoute',
        fb_api_caller_class: 'RelayModern',
        fb_api_req_friendly_name: 'CommentListComponentsRootQuery',
        variables: `{"commentsIntentToken":"CHRONOLOGICAL_UNFILTERED_INTENT_V1","feedLocation":"TAHOE","feedbackSource":41,"focusCommentID":null,"scale":1,"useDefaultActor":false,"id":"${encodedPostId}","__relay_internal__pv__IsWorkUserrelayprovider":false}`,
        server_timestamps: 'true',
        doc_id: '9221104427994320'
      };

      const response = await fetch("https://www.facebook.com/api/graphql/", {
        "headers": {
          "accept": "*/*",
          "accept-language": "en-US,en;q=0.9,vi;q=0.8",
          "content-type": "application/x-www-form-urlencoded",
          "priority": "u=1, i",
          "sec-ch-prefers-color-scheme": "light",
          "sec-ch-ua": "\"Google Chrome\";v=\"135\", \"Not-A.Brand\";v=\"8\", \"Chromium\";v=\"135\"",
          "sec-ch-ua-full-version-list": "\"Google Chrome\";v=\"135.0.7049.115\", \"Not-A.Brand\";v=\"8.0.0.0\", \"Chromium\";v=\"135.0.7049.115\"",
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-model": "\"\"",
          "sec-ch-ua-platform": "\"Windows\"",
          "sec-ch-ua-platform-version": "\"10.0.0\"",
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "x-asbd-id": "359341",
          "x-fb-friendly-name": "CommentListComponentsRootQuery",
          "x-fb-lsd": data.lsd,
          "cookie": this.formatCookies(cookies),
          "Referrer-Policy": "strict-origin-when-cross-origin"
        },
        "body": new URLSearchParams(data).toString(),
        "method": "POST"
      });

      const dataJson = await response.json()
      let dataComment = await this.handleDataComment({
        data: dataJson
      }, proxy)

      return dataComment
    } catch (error) {
      console.log("🚀 ~ getCommentByCookie ~ error:", error.message)
      await this.updateStatusCookieDie(cookieEntity, CookieStatus.LIMIT)
      return null
    }
  }

  async handleDataComment(response, proxy: ProxyEntity) {
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
    userIdComment = isNumeric(userIdComment) ? userIdComment : await this.getUuidByCookie(comment?.author.id, proxy)

    return {
      commentId,
      userNameComment,
      commentMessage,
      phoneNumber,
      userIdComment,
      commentCreatedAt,
    };
  }

  async getProfileLink(url: string, proxy: ProxyEntity, token: TokenEntity) {
    try {
      const httpsAgent = this.getHttpAgent(proxy)
      console.log("----------Đang lấy thông tin url:", url)
      const { headers, cookies } = getHeaderProfileLink()

      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: { ...headers, Cookie: this.formatCookies(cookies) },
          httpsAgent,
        }),
      );
      const htmlContent = response.data

      const matchVideoPublic = htmlContent.match(/,"actors":(\[.*?\])/);
      //case 1: video, post public
      if (matchVideoPublic && matchVideoPublic[1]) {
        console.log("🚀 ~ getProfileLink ~ match[1]:", matchVideoPublic[1])
        const postId = htmlContent?.split('"post_id":"')[1]?.split('"')[0];
        const profileDecode = JSON.parse(matchVideoPublic[1])
        if (postId) {
          return {
            type: LinkType.PUBLIC,
            name: profileDecode[0]?.name ?? url,
            postId: postId,
          }
        }
      }
      //case 3: story
      const matchStoryPublic = htmlContent.match(/story_fbid=(\d+)/);
      if (matchStoryPublic && matchStoryPublic[1]) {
        const postId = matchStoryPublic[1]
        if (postId) {
          return {
            type: LinkType.PRIVATE,
            name: url,
            postId: postId,
          }
        }
      }

      //case 2: cần token
      const params = {
        "order": "reverse_chronological",
        "limit": "1000",
        "access_token": token.tokenValue,
        "created_time": "created_time"
      }

      const responseV1 = await firstValueFrom(
        this.httpService.get(url, {
          headers: { ...headers },
          httpsAgent,
          params
        }),
      );
      const htmlContentV1 = responseV1.data
      const match1 = htmlContentV1.match(/"video_id":"(.*?)"/);
      if (match1 && match1[1]) {
        const postId = match1[1]
        console.log("🚀 ~ getProfileLink ~ match1[1]:", postId)

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
      if ((error?.message as string)?.includes('connect ETIMEDOUT') || (error?.message as string)?.includes('connect ECONNREFUSED')) {
        await this.updateProxyDie(proxy)
        return
      }
      if (error?.response?.status == 400) {
        if (error.response?.data?.error?.code === 368) {
          await this.updateStatusTokenDie(token, TokenStatus.LIMIT)
        }
        if (error.response?.data?.error?.code === 190) {
          await this.updateStatusTokenDie(token, TokenStatus.DIE)
        }
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

  async getInfoAccountsByCookie(httpsAgent, cookie) {
    const cookies = this.changeCookiesFb(cookie);
    const dataUser = await firstValueFrom(
      this.httpService.get('https://www.facebook.com', {
        headers: {
          Cookie: this.formatCookies(cookies)
        },
        httpsAgent
      }),
    );

    const dtsgMatch = dataUser.data.match(/DTSGInitialData",\[\],{"token":"(.*?)"}/);
    const jazoestMatch = dataUser.data.match(/&jazoest=(.*?)"/);
    const userIdMatch = dataUser.data.match(/"USER_ID":"(.*?)"/);

    if (dtsgMatch && jazoestMatch && userIdMatch) {
      const fbDtsg = dtsgMatch[1];
      const jazoest = jazoestMatch[1];
      const facebookId = userIdMatch[1];

      return { fbDtsg, jazoest, facebookId }
    }

    return null
  }

  async getUuidByCookie(uuid: string, proxy: ProxyEntity) {
    const cookieEntity = await this.cookieRepository.findOne({
      where: {
        status: Not(CookieStatus.DIE)
      }
    })
    if (!cookieEntity) return null
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

      // await this.updateStatusCookieDie(cookieEntity, CookieStatus.LIMIT)
      return null
    } catch (error) {
      console.log("🚀 ~ getUuidByCookie ~ error:", error)
      if ((error?.message as string)?.includes('connect ETIMEDOUT') || (error?.message as string)?.includes('connect ECONNREFUSED')) {
        await this.updateProxyDie(proxy)

        return
      }
      if ((error?.message as string)?.includes("Maximum number of redirects exceeded")) {
        await this.updateStatusCookieDie(cookieEntity, CookieStatus.DIE)
      }
      return null
    }
  }

  updateStatusTokenDie(token: TokenEntity, status: TokenStatus) {
    console.log("🚀 ~ updateTokenDie ~ token:", token)
    return this.tokenRepository.save({ ...token, status })
  }

  updateStatusCookieDie(cookie: CookieEntity, status: CookieStatus) {
    console.log("🚀 ~ updateCookieDie ~ cookie:", cookie)
    return this.cookieRepository.save({ ...cookie, status })
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

  getCookieActiveFromDb(): Promise<CookieEntity> {
    return this.cookieRepository.findOne({
      where: {
        status: CookieStatus.ACTIVE
      }
    })
  }
}
