/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { AxiosProxyConfig, AxiosRequestConfig } from 'axios';
import * as dayjs from 'dayjs';
import { firstValueFrom } from 'rxjs';
import { extractPhoneNumber } from 'src/common/utils/helper';
import { v4 as uuidv4 } from 'uuid';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import {
  getBodyComment,
  getBodyToken,
  getHeaderComment,
  getHeaderProfileFb,
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

  constructor(private readonly httpService: HttpService) {}

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

  async getCmt(postId: string, proxy: AxiosProxyConfig) {
    const headers = getHeaderComment(this.fbUrl);
    const body = getBodyComment(postId);

    try {
      const response = await firstValueFrom(
        this.httpService.post(this.fbGraphql, body, {
          headers,
          proxy,
        }),
      );
      const cmt =
        response?.data?.data?.node?.comment_rendering_instance_for_feed_location
          ?.comments.edges?.[0]?.node;
      const commentId = cmt['id'];
      const message =
        cmt?.preferred_body && cmt?.preferred_body?.text
          ? cmt?.preferred_body?.text
          : 'Sticker';
      const phoneNumber = extractPhoneNumber(message);
      const userName = cmt?.author?.name;
      const createdAt = dayjs(cmt?.created_time * 1000)
        .tz(this.ukTimezone)
        .format('YYYY-MM-DD HH:mm:ss');
      const serialized = cmt?.discoverable_identity_badges_web?.[0]?.serialized;
      const userId = serialized
        ? JSON.parse(serialized).actor_id
        : cmt?.author.id;

      const res = {
        commentId,
        userName,
        message,
        phoneNumber,
        userId,
        createdAt,
      };

      return res;
    } catch (error) {
      throw new Error(`Failed to fetch comments: ${error.message}`);
    }
  }
}
