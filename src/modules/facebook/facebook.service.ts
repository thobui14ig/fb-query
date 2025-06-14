/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { AxiosRequestConfig } from 'axios';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import { firstValueFrom } from 'rxjs';
import { TokenType } from '../token/entities/token.entity';
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


  private formatCookies(cookies: Record<string, string>): string {
    return Object.entries(cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
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
}
