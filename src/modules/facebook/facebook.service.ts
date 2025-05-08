/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { faker } from '@faker-js/faker';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AxiosRequestConfig } from 'axios';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import { HttpsProxyAgent } from 'https-proxy-agent';
import fetch from 'node-fetch';
import { firstValueFrom } from 'rxjs';
import { isNumeric } from 'src/common/utils/check-utils';
import { extractPhoneNumber } from 'src/common/utils/helper';
import { IsNull, Like, Not, Repository } from 'typeorm';
import { CommentEntity } from '../comments/entities/comment.entity';
import { CookieEntity, CookieStatus } from '../cookie/entities/cookie.entity';
import { LinkEntity, LinkType } from '../links/entities/links.entity';
import { ProxyEntity, ProxyStatus } from '../proxy/entities/proxy.entity';
import { TokenEntity, TokenStatus } from '../token/entities/token.entity';
import {
  getBodyComment,
  getBodyToken,
  getHeaderComment,
  getHeaderProfileFb,
  getHeaderProfileLink,
  getHeaderToken,
} from './utils';
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
    private linkRepository: Repository<LinkEntity>,
    @InjectRepository(CommentEntity)
    private commentRepository: Repository<CommentEntity>,
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
      if (!dataComment && typeof response.data === 'string') {
        //story
        const text = response.data
        const lines = text.trim().split('\n');
        const data = JSON.parse(lines[0])

        dataComment = await this.handleDataComment({ data }, proxy)

      }

      if (!dataComment) {
        //bai viet ko co cmt moi nhat => lay all
        dataComment = await this.getCommentWithCHRONOLOGICAL_UNFILTERED_INTENT_V1(postId, proxy, 'CHRONOLOGICAL_UNFILTERED_INTENT_V1')
      }

      const { commentId,
        userNameComment,
        commentMessage,
        phoneNumber,
        userIdComment,
        commentCreatedAt, totalCount } = dataComment || {}

      const res = {
        commentId,
        userNameComment,
        commentMessage,
        phoneNumber,
        userIdComment,
        commentCreatedAt,
        totalCount
      };

      return res;
    } catch (error) {
      console.log("🚀 ~ getCmtPublic ~ error:", error?.message)
      if ((error?.message as string)?.includes('connect ETIMEDOUT') || (error?.message as string)?.includes('connect ECONNREFUSED')) {
        await this.updateProxyDie(proxy)
        return
      }

      return null
    }
  }

  async getCommentWithCHRONOLOGICAL_UNFILTERED_INTENT_V1(postId: string, proxy: ProxyEntity, type: string) {
    const fetchCm = async (after = null) => {

      if (!after) {
        const httpsAgent = this.getHttpAgent(proxy)
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
          "commentsIntentToken": "${type}",
          "feedLocation": "PERMALINK",
          "feedbackSource": 2,
          "focusCommentID": null,
          "scale": 1,
          "useDefaultActor": false,
          "id": "${postId}",
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

      const res = await fetch("https://www.facebook.com/api/graphql/", {
        "headers": {
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
        "body": `av=0&__aaid=0&__user=0&__a=1&__req=h&__hs=20215.HYP%3Acomet_loggedout_pkg.2.1...0&dpr=1&__ccg=EXCELLENT&__rev=1022594794&__s=h4jekx%3Apdamzq%3Aoxbhj3&__hsi=7501715228560864879&__dyn=7xeUmwlEnwn8K2Wmh0no6u5U4e0yoW3q322aew9G2S0zU20xi3y4o11U1lVE4W0qafw9q0yE462mcwfG12wOx62G3i0Bo7O2l0Fwqob82kw9O1lwlE-U2exi4UaEW0Lobrwh8lw8Xxm16waCm260im3G2-azo3iwPwbS16wEwTwNwLwFg2Xwkoqwqo4eE7W1iwGBG2O7E5y1rwea1ww&__csr=gatn4EAbPNZJlitbBbtrFH-Ku9AhrXKAQuvt7DoGmjAKuBLJ2rx1auUKpqJ7-jAKdWGuVFFokxeEkDzrzUGcQh5CChGFa3aGhEK4HUvDyEpBgaVHzpV-bybhoGUC2afBxC2G5ozz8iw2n8ybzE38w2RU3ug2OU3Bw20U089u06eXwOwUweK042U2Tw9p071gGbg0tiw14K-1Qwb60c0w08quh5xp01QK0aoxGFkl6w0HSo3E_U21yo0Xq0arw6_y2i07Vw8O0o-07Do0SME1u80xRwjUuwb-fwd208uw6Iw65wGAxS0nC2-3C0bVw960ayw17u0e9Aw2A62W1MxRw7kw2sQ1CyUJ1q0NU-0f880cfojyE1x80P20IEao3Az8eEfE0mHwQw0CZw2Vo7G0b9w3xS6m07KU0Ip04Iw4LwcqsK0d5U&__comet_req=15&lsd=AVori-u58Do&jazoest=2931&__spin_r=1022594794&__spin_b=trunk&__spin_t=1746629185&__crn=comet.fbweb.CometVideoHomeLOEVideoPermalinkRoute&fb_api_caller_class=RelayModern&fb_api_req_friendly_name=CommentsListComponentsPaginationQuery&variables=%7B%22commentsAfterCount%22%3A-1%2C%22commentsAfterCursor%22%3A%22${after}%22%2C%22commentsBeforeCount%22%3Anull%2C%22commentsBeforeCursor%22%3Anull%2C%22commentsIntentToken%22%3Anull%2C%22feedLocation%22%3A%22TAHOE%22%2C%22focusCommentID%22%3Anull%2C%22scale%22%3A1%2C%22useDefaultActor%22%3Afalse%2C%22id%22%3A%22${postId}%22%2C%22__relay_internal__pv__IsWorkUserrelayprovider%22%3Afalse%7D&server_timestamps=true&doc_id=9830142050356672`,
        "method": "POST"
      });
      const text = await res.text()
      const lines = text.trim().split('\n');
      const data = JSON.parse(lines[0])

      return {
        data
      }

    }

    let after = null;
    let hasNextPage = true;
    let responsExpected = null;

    while (hasNextPage) {
      const response = await fetchCm(after);
      const pageInfo = response?.data?.data?.node?.comment_rendering_instance_for_feed_location?.comments?.page_info || {};
      hasNextPage = pageInfo.has_next_page;
      after = pageInfo.end_cursor;
      await this.delay(500)
      if (!hasNextPage) {
        responsExpected = response
        break;
      }
    }

    const comment =
      responsExpected?.data?.data?.node?.comment_rendering_instance_for_feed_location
        ?.comments.edges?.reverse()?.[0]?.node;

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
    userIdComment = isNumeric(userIdComment) ? userIdComment : (await this.getUuidByCookie(comment?.author.id, proxy)) || userIdComment
    const totalCount = responsExpected?.data?.data?.node?.comment_rendering_instance_for_feed_location?.comments?.total_count

    return {
      commentId,
      userNameComment,
      commentMessage,
      phoneNumber,
      userIdComment,
      commentCreatedAt,
      totalCount
    };
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

  async getCommentByToken(postId: string, proxy: ProxyEntity) {
    const token = await this.getTokenActiveFromDb()
    if (!token) {
      return
    }
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

      if (error?.response?.status == 400) {
        if (error.response?.data?.error?.code === 368) {
          await this.updateStatusTokenDie(token, TokenStatus.LIMIT)
        }
        if (error.response?.data?.error?.code === 190) {
          await this.updateStatusTokenDie(token, TokenStatus.DIE)
        }
        if (error.response?.data?.error?.code === 100 && (error?.response?.data?.error?.message as string)?.includes('Unsupported get request. Object with ID')) {
          await this.updateLinkPostIdInvalid(postId)
        }
      }

      return {}
    }
  }

  async getCommentByCookie(proxy: ProxyEntity, postId: string) {
    const cookieEntity = await this.getCookieActiveFromDb()
    if (!cookieEntity) return null
    console.log("🚀 ~ getCommentByCookie ~ getCommentByCookie:", postId)

    try {
      const id = `feedback:${postId}`;
      const encodedPostId = Buffer.from(id, 'utf-8').toString('base64');
      const httpsAgent = this.getHttpAgent(proxy)
      const { facebookId, fbDtsg, jazoest } = await this.getInfoAccountsByCookie(httpsAgent, cookieEntity.cookie) || {}

      if (!facebookId) {
        await this.updateStatusCookie(cookieEntity, CookieStatus.DIE)

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
        variables: `{"commentsIntentToken":"RECENT_ACTIVITY_INTENT_V1","feedLocation":"TAHOE","feedbackSource":41,"focusCommentID":null,"scale":1,"useDefaultActor":false,"id":"${encodedPostId}","__relay_internal__pv__IsWorkUserrelayprovider":false}`,
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
      if ((error?.message as string)?.includes("Maximum number of redirects exceeded")) {
        await this.updateStatusCookie(cookieEntity, CookieStatus.LIMIT)
        return
      }
      if ((error?.message as string)?.includes("Unexpected non-whitespace character after")) {
        await this.updateStatusCookie(cookieEntity, CookieStatus.LIMIT)
        return
      }

      await this.updateStatusCookie(cookieEntity, CookieStatus.DIE)
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
    const totalCount = response?.data?.data?.node?.comment_rendering_instance_for_feed_location?.comments?.total_count
    userIdComment = isNumeric(userIdComment) ? userIdComment : (await this.getUuidByCookie(comment?.author.id, proxy)) || userIdComment

    return {
      commentId,
      userNameComment,
      commentMessage,
      phoneNumber,
      userIdComment,
      commentCreatedAt,
      totalCount
    };
  }

  async getProfileLink(url: string, proxy: ProxyEntity) {
    const token = await this.getTokenActiveFromDb()

    try {
      console.log("🚀 ~ MonitoringService ~ cronjobHandleProfileUrl ~ this.isHandleUrl:", url)
      const httpsAgent = this.getHttpAgent(proxy)
      console.log("----------Đang lấy thông tin url:", url)
      const { headers, cookies } = getHeaderProfileLink()

      // const response = await firstValueFrom(
      //   this.httpService.get(url, {
      //     headers: { ...headers, Cookie: this.formatCookies(cookies) },
      //     httpsAgent,
      //   }),
      // );
      const response = await fetch(url, {
        "headers": {
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
        "referrerPolicy": "origin-when-cross-origin",
        "body": null,
        "method": "GET"
      });
      const htmlContent = await response.text()

      const matches = [...htmlContent.matchAll(/href="([^"]+)"/g)];
      const expectedUrl = matches[1] ? matches[1][1].replace('amp;', '') : null;
      console.log("🚀 ~ getProfileLink ~ expectedUrl:", expectedUrl)

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
            type: LinkType.PUBLIC,
            name: url,
            postId: postId,
          }
        }
      }

      //case 2: cần token
      if (!token) {
        return {
          type: LinkType.UNDEFINED,
        }
      }
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
        type: LinkType.DIE,
      }
    } catch (error) {
      console.log("🚀 ~ getProfileLink ~ error:", error?.message)
      if ((error?.message as string)?.includes('connect ETIMEDOUT') || (error?.message as string)?.includes('connect ECONNREFUSED') || error?.status === 407) {
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

  async getPostIdV2(url: string) {
    try {
      const cookieEntity = await this.getCookieActiveFromDb()
      if (!cookieEntity) return null
      const cookies = this.changeCookiesFb(cookieEntity.cookie)

      const response = await fetch(url, {
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
        "body": null,
        "method": "GET"
      });
      const match = (await response.text()).match(/"post_id":"(.*?)"/);

      if (match && match[1]) {
        return match[1]
      }

      return null
    } catch (error) {
      console.log("🚀 ~ getPostIdV2 ~ error:", error?.message)
      return null
    }
  }

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

      // await this.updateStatusCookie(cookieEntity, CookieStatus.LIMIT)
      return null
    } catch (error) {
      console.log("🚀 ~ getUuidByCookie ~ error:", error?.message)
      if ((error?.message as string)?.includes('connect ETIMEDOUT') || (error?.message as string)?.includes('connect ECONNREFUSED')) {
        await this.updateProxyDie(proxy)

        return
      }
      if ((error?.message as string)?.includes("Maximum number of redirects exceeded")) {
        await this.updateStatusCookie(cookieEntity, CookieStatus.LIMIT)
      }
      return null
    }
  }

  updateStatusTokenDie(token: TokenEntity, status: TokenStatus) {
    console.log("🚀 ~ updateTokenDie ~ token:", token)
    return this.tokenRepository.save({ ...token, status })
  }

  updateStatusCookie(cookie: CookieEntity, status: CookieStatus) {
    console.log("🚀 ~ updateStatusCookie ~ cookie:", status, cookie)
    return this.cookieRepository.save({ ...cookie, status })
  }

  updateProxyDie(proxy: ProxyEntity) {
    console.log("🚀 ~ updateProxyDie ~ proxy:", proxy)
    return this.proxyRepository.save({ ...proxy, status: ProxyStatus.IN_ACTIVE })
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
        status: CookieStatus.ACTIVE
      }
    })
    const randomIndex = Math.floor(Math.random() * cookies.length);
    const randomCookie = cookies[randomIndex];

    return randomCookie
  }

  async getTokenActiveFromDb(): Promise<TokenEntity> {
    const tokens = await this.tokenRepository.find({
      where: {
        status: TokenStatus.ACTIVE
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
    const comments = await this.commentRepository.find({
      where: {
        uid: Like('pfbid%')  // Tìm tất cả các bản ghi có `uid` bắt đầu với "pfbid"
      }
    })
    for (const comment of comments) {
      const proxy = await this.getRandomProxy()
      const uid = await this.getUuidByCookie(comment.uid, proxy)
      comment.uid = uid
      await this.commentRepository.save(uid)
    }
  }

  async getRandomProxy() {
    const proxies = await this.proxyRepository.find({
      where: {
        status: ProxyStatus.ACTIVE
      }
    })
    const randomIndex = Math.floor(Math.random() * proxies.length);
    const randomProxy = proxies[randomIndex];

    return randomProxy
  }
}
