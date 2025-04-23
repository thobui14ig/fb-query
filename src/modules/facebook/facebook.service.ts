/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { AxiosRequestConfig } from 'axios';
import * as dayjs from 'dayjs';
import * as timezone from 'dayjs/plugin/timezone';
import * as utc from 'dayjs/plugin/utc';
import { firstValueFrom } from 'rxjs';
import { isNumeric } from 'src/common/utils/check-utils';
import { extractPhoneNumber } from 'src/common/utils/helper';
import { LinkType } from '../links/entities/links.entity';
import { IGetProfileLinkResponse } from './facebook.service.i';
import {
  getBodyComment,
  getBodyToken,
  getHeaderComment,
  getHeaderProfileFb,
  getHeaderProfileLink,
  getHeaderToken,
} from './utils';

dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class FacebookService {
  appId = '256002347743983';
  fbUrl = 'https://www.facebook.com';
  fbGraphql = `https://www.facebook.com/api/graphql`;
  ukTimezone = 'Asia/Bangkok';

  constructor(private readonly httpService: HttpService) { }

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

  async getCmt(postId: string, httpsAgent) {
    const headers = getHeaderComment(this.fbUrl);
    const body = getBodyComment(postId);

    try {
      const response = await firstValueFrom(
        this.httpService.post(this.fbGraphql, body, {
          headers,
          httpsAgent
        }),
      );

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
      const commentCreatedAt = dayjs(comment?.created_time * 1000).format('YYYY-MM-DD HH:mm:ss');
      const serialized = comment?.discoverable_identity_badges_web?.[0]?.serialized;
      let userIdComment = serialized ? JSON.parse(serialized).actor_id : comment?.author.id
      userIdComment = isNumeric(userIdComment) ? userIdComment : await this.getUuidByCookie(comment?.author.id, httpsAgent)

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
      console.log("🚀 ~ getCmt ~ error:", error?.message)
      throw new Error(error?.message)
    }
  }

  async getProfileLink(url: string, httpsAgent: any): Promise<IGetProfileLinkResponse> {
    try {
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
        return {
          type: LinkType.PUBLIC,
          name: profileDecode[0]?.name,
          postId: postId,
        }
      }
      //case 2: video
      const match1 = htmlContent.match(/"video_owner":({.*?})/);
      if (match && match1[1]) {
        console.log("🚀 ~ getProfileLink ~ match1[1]:", match1[1])
        let videoOwnerJson = JSON.parse(match1[1])
        const postId = htmlContent?.split('"post_id":"')[1]?.split('"')[0];
        // const pageId = videoOwnerJson.split('"id":"')[1].split('","')[0];
        let name = videoOwnerJson?.split('"name":"')[1]?.split('","')[0];
        name = JSON.parse(`"${name}"`);
        return {
          type: LinkType.PUBLIC,
          name,
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

  async getProfileUserByUuid(name: string, uuid: string, httpsAgent) {
    const dataUser = await firstValueFrom(
      this.httpService.get(`https://www.facebook.com/people/${name}/${uuid}`, {
        headers: {
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          "accept-language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
          "cache-control": "max-age=0",
          "cookie": "datr=nSR2Z_oJHz-4IM1RO18kh-7-; sb=nSR2Z3jWL2LzGxQFb8Hh5zmI; dpr=1.25; ps_l=1; ps_n=1; fr=0tNBmTCvSwJfOacCc..Bneanz..AAA.0.0.Bneaq3.AWWizVfr1ZQ; wd=816x703",
          "dpr": "1.25",
          "priority": "u=0, i",
          "sec-ch-prefers-color-scheme": "light",
          "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
          "sec-ch-ua-full-version-list": '"Google Chrome";v="131.0.6778.205", "Chromium";v="131.0.6778.205", "Not_A Brand";v="24.0.0.0"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-model": "",
          "sec-ch-ua-platform": "Windows",
          "sec-ch-ua-platform-version": "8.0.0",
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "none",
          "sec-fetch-user": "?1",
          "upgrade-insecure-requests": "1",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "viewport-width": "816"
        },
        httpsAgent
      }),
    );
    const match = dataUser.data.match(/fb:\/\/profile\/(\d+)/);

    if (match && match[1]) {
      console.log("🚀 ~ getProfileUserByUuid ~ match:", match[1])
      const userId = match[0].split("fb://profile/")[1].split('"')[0]
      return userId
    }

    return null
  }

  async getInfoAccountsByCookie(httpsAgent) {
    const cookies = this.changeCookiesFb(`datr=5-kEaEggYORdPbZny5oFp5pB; sb=_ukEaIt0oqbw6wKP9ZDCQGqs; ps_l=1; ps_n=1; ar_debug=1; c_user=100051755359634; presence=C%7B%22t3%22%3A%5B%5D%2C%22utc3%22%3A1745417906996%2C%22v%22%3A1%7D; fr=18l2CnqH1U3kE0vFh.AWf60Zfuql4K5EJZz9tCiL5oEOMUFtk_CQ4hB59qFijMRBB3cxA.BoCPkE..AAA.0.0.BoCPkE.AWfm1RtyihH2YrUXFWIXorCpykI; xs=50%3AHmELAuPsvrwShw%3A2%3A1745414736%3A-1%3A6267%3A%3AAcWWuYoW2hx5484cjcYMMjZqffe4pt2kztewER0EVw; wd=1912x252`);
    const dataUser = await firstValueFrom(
      this.httpService.get('https://www.facebook.com/pfbid0TJT85ZZMCi5YnookFbfevyNGCjGURBjByXYGNrg3VKBXcA6EzTVYiCPTuFELoHvxl', {
        headers: {
          Cookie: this.formatCookies(cookies)
        },
        // httpsAgent
      }),
    );

    // const dtsgMatch = dataUser.data.match(/DTSGInitialData",\[\],{"token":"(.*?)"}/);
    // const jazoestMatch = dataUser.data.match(/&jazoest=(.*?)"/);
    // const userIdMatch = dataUser.data.match(/"USER_ID":"(.*?)"/);

    // if (dtsgMatch && jazoestMatch && userIdMatch) {
    //   const fbDtsg = dtsgMatch[1];
    //   const jazoest = jazoestMatch[1];
    //   const facebookId = userIdMatch[1];

    //   console.log(`🚀 ~ getInfoAccountsByCookie ~ { fbDtsg, jazoest, facebookId }:`, { fbDtsg, jazoest, facebookId })
    //   return { fbDtsg, jazoest, facebookId }
    // }
  }

  async getUuidByCookie(uuid: string, httpsAgent) {
    const cookies = this.changeCookiesFb(`c_user=61575647909201; xs=19:rcpADPk3PNlPFg:2:1745395358:-1:-1; fr=0plgX3kfaGXWWEW8D.AWeN-6rlNUhxPZBiX2c5kzqyiIzPCfq31kh7AUdsW-weVHAJbvY.BoCJ6d..AAA.0.0.BoCJ6d.AWdVNwRIWQy-OR5OlR5v1PQpFzs; datr=nZ4IaKt0PGuQ4sUq5KCH--fW`);
    const dataUser = await firstValueFrom(
      this.httpService.get(`https://www.facebook.com/${uuid}`, {
        headers: {
          Cookie: this.formatCookies(cookies)
        },
        // httpsAgent
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
  }
}
