/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { faker } from '@faker-js/faker';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AxiosRequestConfig } from 'axios';
import { isArray } from 'class-validator';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { firstValueFrom } from 'rxjs';
import { isAlpha, isNumeric } from 'src/common/utils/check-utils';
import { extractFacebookId, extractPhoneNumber } from 'src/common/utils/helper';
import { In, IsNull, Not, Repository } from 'typeorm';
import { CommentEntity } from '../comments/entities/comment.entity';
import { CookieEntity, CookieStatus } from '../cookie/entities/cookie.entity';
import { LinkEntity, LinkStatus, LinkType } from '../links/entities/links.entity';
import { ProxyEntity, ProxyStatus } from '../proxy/entities/proxy.entity';
import { DelayEntity } from '../setting/entities/delay.entity';
import { TokenEntity, TokenStatus, TokenType } from '../token/entities/token.entity';
import { GetInfoLinkUseCase } from './usecase/get-info-link/get-info-link';
import {
  getBodyComment,
  getBodyToken,
  getHeaderComment,
  getHeaderProfileFb,
  getHeaderToken
} from './utils';
import { GetCommentPublicUseCase } from './usecase/get-comment-public/get-comment-public';
import { GetCommentPrivateUseCase } from './usecase/get-comment-private/get-comment-private';
import { GetUuidUserUseCase } from './usecase/get-uuid-user/get-uuid-user';

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
    private getUuidUserUseCase: GetUuidUserUseCase

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

  async getCommentWithCHRONOLOGICAL_UNFILTERED_INTENT_V1(postId: string, proxy: ProxyEntity, link: LinkEntity, isGetCommentCount: boolean) {
    const httpsAgent = this.getHttpAgent(proxy)

    const fetchCm = async (after = null) => {
      if (!after) {
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
          "commentsIntentToken": "CHRONOLOGICAL_UNFILTERED_INTENT_V1",
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

      const res = await firstValueFrom(
        this.httpService.post("https://www.facebook.com/api/graphql/", `av=0&__aaid=0&__user=0&__a=1&__req=h&__hs=20215.HYP%3Acomet_loggedout_pkg.2.1...0&dpr=1&__ccg=EXCELLENT&__rev=1022594794&__s=h4jekx%3Apdamzq%3Aoxbhj3&__hsi=7501715228560864879&__dyn=7xeUmwlEnwn8K2Wmh0no6u5U4e0yoW3q322aew9G2S0zU20xi3y4o11U1lVE4W0qafw9q0yE462mcwfG12wOx62G3i0Bo7O2l0Fwqob82kw9O1lwlE-U2exi4UaEW0Lobrwh8lw8Xxm16waCm260im3G2-azo3iwPwbS16wEwTwNwLwFg2Xwkoqwqo4eE7W1iwGBG2O7E5y1rwea1ww&__csr=gatn4EAbPNZJlitbBbtrFH-Ku9AhrXKAQuvt7DoGmjAKuBLJ2rx1auUKpqJ7-jAKdWGuVFFokxeEkDzrzUGcQh5CChGFa3aGhEK4HUvDyEpBgaVHzpV-bybhoGUC2afBxC2G5ozz8iw2n8ybzE38w2RU3ug2OU3Bw20U089u06eXwOwUweK042U2Tw9p071gGbg0tiw14K-1Qwb60c0w08quh5xp01QK0aoxGFkl6w0HSo3E_U21yo0Xq0arw6_y2i07Vw8O0o-07Do0SME1u80xRwjUuwb-fwd208uw6Iw65wGAxS0nC2-3C0bVw960ayw17u0e9Aw2A62W1MxRw7kw2sQ1CyUJ1q0NU-0f880cfojyE1x80P20IEao3Az8eEfE0mHwQw0CZw2Vo7G0b9w3xS6m07KU0Ip04Iw4LwcqsK0d5U&__comet_req=15&lsd=AVori-u58Do&jazoest=2931&__spin_r=1022594794&__spin_b=trunk&__spin_t=1746629185&__crn=comet.fbweb.CometVideoHomeLOEVideoPermalinkRoute&fb_api_caller_class=RelayModern&fb_api_req_friendly_name=CommentsListComponentsPaginationQuery&variables=%7B%22commentsAfterCount%22%3A-1%2C%22commentsAfterCursor%22%3A%22${after}%22%2C%22commentsBeforeCount%22%3Anull%2C%22commentsBeforeCursor%22%3Anull%2C%22commentsIntentToken%22%3Anull%2C%22feedLocation%22%3A%22TAHOE%22%2C%22focusCommentID%22%3Anull%2C%22scale%22%3A1%2C%22useDefaultActor%22%3Afalse%2C%22id%22%3A%22${postId}%22%2C%22__relay_internal__pv__IsWorkUserrelayprovider%22%3Afalse%7D&server_timestamps=true&doc_id=9830142050356672`, {
          headers: {
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
          httpsAgent
        }),
      )

      let data = null
      if (typeof res.data === "string") {
        const lines = res.data.trim().split('\n');
        data = JSON.parse(lines[0])
      } else {
        data = res.data
      }

      return {
        data
      }

    }

    let after = null;
    let hasNextPage = true;
    let responsExpected = null;
    let commentCount = null
    let likeCount = null

    while (hasNextPage) {
      const response = await fetchCm(after);
      const pageInfo = response?.data?.data?.node?.comment_rendering_instance_for_feed_location?.comments?.page_info || {};
      const comments = response?.data?.data?.node?.comment_rendering_instance_for_feed_location?.comments
      if (comments) {
        commentCount = comments?.total_count
        likeCount = comments?.count
      }
      hasNextPage = pageInfo.has_next_page;
      after = pageInfo.end_cursor;
      await this.delay(500)
      if (!hasNextPage || isGetCommentCount) {
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

    const isCommentExit = await this.commentRepository.findOne({
      where: {
        name: userNameComment,
        timeCreated: commentCreatedAt as any,
        linkId: link.id
      }
    })

    userIdComment = !isCommentExit ? (isNumeric(userIdComment) ? userIdComment : (await this.getUuidByCookie(comment?.author.id)) || userIdComment) : isCommentExit.uid
    const totalCount = commentCount
    const totalLike = likeCount

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
    console.log("----------Đang lấy thông tin url:", url, id);

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

  async getUuidByCookie(uuid: string) {
    const cookieEntity = await this.getCookieActiveOrLimitFromDb()
    if (!cookieEntity) return null
    const proxy = await this.getRandomProxy()
    if (!proxy) return null
    const httpsAgent = this.getHttpAgent(proxy)
    try {
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
      console.log("🚀 ~ getUuidByCookie ~ error:", error.message)
      if ((error?.message as string)?.includes("Maximum number of redirects exceeded")) {
        await this.updateStatusCookie(cookieEntity, CookieStatus.LIMIT)
      }
      if ((error?.message as string)?.includes("Unexpected non-whitespace character after")) {
        await this.updateStatusCookie(cookieEntity, CookieStatus.LIMIT)
        return
      }

      if ((error?.message as string)?.includes("Unexpected token 'o'")) {
        await this.updateStatusCookie(cookieEntity, CookieStatus.DIE, "Unexpected token 'o'")
        return
      }
      return null
    }
  }

  async getUuidByCookieV2(uuid: string) {
    const cookieEntity = await this.getCookieActiveOrLimitFromDb()
    if (!cookieEntity) return null
    const proxy = await this.getRandomProxy()
    if (!proxy) return null
    const httpsAgent = this.getHttpAgent(proxy)
    try {
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
      if ((error?.message as string)?.includes("Maximum number of redirects exceeded")) {
        await this.updateStatusCookie(cookieEntity, CookieStatus.LIMIT)
      }
      if ((error?.message as string)?.includes("Unexpected non-whitespace character after")) {
        await this.updateStatusCookie(cookieEntity, CookieStatus.LIMIT)
        return
      }

      if ((error?.message as string)?.includes("Unexpected token 'o'")) {
        await this.updateStatusCookie(cookieEntity, CookieStatus.DIE, "Unexpected token 'o'")
        return
      }
      return null
    }
  }

  async getUuidPublic(uuid: string) {
    try {
      const proxy = await this.getRandomProxy()
      const httpsAgent = this.getHttpAgent(proxy)
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

  async getTotalCountWithToken(link: LinkEntity) {
    const proxy = await this.getRandomProxy()
    const token = await this.getTokenEAAAAAYActiveFromDb()
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
        status: TokenStatus.ACTIVE
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
        tokenValueV1: Not(IsNull())
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

  async hideCmt(cmtId: string, cookie: CookieEntity) {
    try {
      const proxy = await this.getRandomProxy()
      const httpsAgent = this.getHttpAgent(proxy)
      const cookies = this.changeCookiesFb(cookie.cookie);
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
            "cookie": this.formatCookies(cookies),
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
}
