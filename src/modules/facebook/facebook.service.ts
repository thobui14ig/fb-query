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
import { writeFile } from 'src/common/utils/file';

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
    try {
      const data = await fetch("https://www.facebook.com/api/graphql/", {
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
          "x-fb-lsd": "75EkBjmGclRVYOYYFCqjHh",
          "cookie": "sb=IpN2Z63pdgaswLIv6HwTPQe2; datr=IpN2Z00h-Sszzq5SH9_OEMEK; ps_l=1; ps_n=1; c_user=100051755359634; ar_debug=1; fr=1BqFFTlBPC9tB0wN1.AWdFNuavNWHt0HQibI3tafV9AFTJ_PEe1-Gl5r3cZmwwypEoM0Q.BoDIYP..AAA.0.0.BoDIYP.AWfK5FwVZmstZ_IDPGUBq0lf8tk; xs=50%3AguFLgEGSSRa2UQ%3A2%3A1745648494%3A-1%3A6267%3A%3AAcXRmP8x_hWVtlZalo1ggZkxBipyKg1yLYv12uGTyA; wd=1086x953; presence=C%7B%22t3%22%3A%5B%5D%2C%22utc3%22%3A1745651897840%2C%22v%22%3A1%7D",
          "Referer": "https://www.facebook.com/122190724718188484",
          "Referrer-Policy": "strict-origin-when-cross-origin"
        },
        "body": `av=100051755359634&__aaid=0&__user=100051755359634&__a=1&__req=13&__hs=20204.HYP%3Acomet_pkg.2.1...0&dpr=1&__ccg=EXCELLENT&__rev=1022270081&__s=lauzjz%3Ag9ver4%3Adjel4c&__hsi=7497517778598929573&__dyn=7xeXzWK1ixt0mUyEqxemh0noeEb8nwgUao5-ewSwAyU8EW0CEboG0x8bo5a58e8hwaG1sw9u0LVEtwMw6yzU887m221Fwgo9oO0-E4a3a4oaEnxO0Bo7O2l2Utwqob82kwiE567Udo5qfK0zEkxe2GewGwkUe9obrwh8lwUwgojUlDw-wUwxwjFovUaU3VwLyEbUGdG0HE88cA0z8c84q58jyUaUbGxe6Uak0zU8oC1hxB0qo4e4UcEeE-3WVU-4FqwIK6E4-mEbUaU3ywo8&__csr=gf4dhtNYAj2O9ke8dPkGkXN4QO8REOOQD5PvFmBnbTbTlQBl8HaOWkJFqhGhklLGZmO9aBJLG_Rh12T-Aih-mAZqYzlpe8iQbzbKqGBz_ykiiF8HABCGjAy9UDyufhUqAyVaAh9vl5GGiF4ChK9z8gKfKmaK4bDyoSEKi4UyFUSqu269USFqAyFoCui-17-4bwgk5omCxm4EqUK8x2iUuxC2222i2WqE2dzF8_wCUS7E-U469wo8nwYwm8eUaEnzaK6orxeh0gpEdEkAgb-10wgovUrxK0Q89XwEDwZweK09Jg2iwb6aJ045zU461px20CU3Bg5zKbz85bwpEKcmn280Ra0yEJiU3pQ2C1Rh8uxG8jhEGuA1SDdwvouU3MUco4yp02147o5y1tx28w27833w0kNk00gyi0mu0t60K89U10U520f6g0rjwbt6wbi0gq0PE7G1bw1vi0dC8m8zC05_60gJ0XEM0k6w9105uw4TxK08Uye080c02krw15K12w4Cg0gnwBw61w98weU0g_w4hxy022m1VK0pmlw&__hsdp=gbA649E56Dj29zJ5ghh6N2q2rGsszaXAqibmOEJpaqal24dBk4q8z2kANhkt8OaSEJ9ajlmyA9FdmdIBuEYp4F4h4Wq646OqkFkpHfIB8xQhHyWhaOF8yip2cA-zkcF3QjOuEx5epKEVNn91wydAf118yidEVx0ZiEY9qK83PzCpl8PpcAoh4BgwForypFEyElUDd8z8PAGhDyoLhkSl8xV927lCpXn4asFJ4WJZ7yZVpTIKqFUCVh4JmQAzd888PFaEkgWZH8V4ld23Pxqa4eq4VXxKmtakzUyX7ChKqU-x2yUPByG4ySAFAK9z-c53pEfA4Erio68zzayEnt2n6AF1GkWyVovxe321FAIMV-5keB6Eo2ebDG9wACyHg2i8E9e2AV8copwyg2dwQgb84am5E7i0hO0G8IMpgmGVNUpwBzE6Vw8u9Gqm2y592AA58m2hy8swlUmwKw93Ax8EG2O1Cw6hwJwnU7e1UAwgV8ixEw5908W0ni0ge0C86q0No16bDAyE3vx62i3-0MrzoG2u1rw47wgU10E3Twjo28wkU1xo1AUlwcafwro3bw5ow2XE0Hm2e220mS1UzE0DK1gw2MU&__comet_req=15&fb_dtsg=NAcNlfTjyvJSxvSp7HFwuts_qhBmOoNkkedwa_vy5Vkq_A7_GT2yO6Q%3A50%3A1745648494&jazoest=25891&lsd=75EkBjmGclRVYOYYFCqjHh&__spin_r=1022270081&__spin_b=trunk&__spin_t=1745651890&__crn=comet.fbweb.CometTahoeRoute&fb_api_caller_class=RelayModern&fb_api_req_friendly_name=CommentListComponentsRootQuery&variables=%7B%22commentsIntentToken%22%3A%22RECENT_ACTIVITY_INTENT_V1%22%2C%22feedLocation%22%3A%22TAHOE%22%2C%22feedbackSource%22%3A41%2C%22focusCommentID%22%3Anull%2C%22scale%22%3A1%2C%22useDefaultActor%22%3Afalse%2C%22id%22%3A%22${postId}3%22%2C%22__relay_internal__pv__IsWorkUserrelayprovider%22%3Afalse%7D&server_timestamps=true&doc_id=9221104427994320`,
        "method": "POST"
      });
      // writeFile(response, 'aaa')
      const response = await data.json()
      const comment =
        response?.data?.node?.comment_rendering_instance_for_feed_location
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

  async getProfileLink(url: string, httpsAgent: any) {
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
      writeFile(htmlContent, 'abc')
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
          type: LinkType.PUBLIC,
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
    const cookies = this.changeCookiesFb(`datr=5-kEaEggYORdPbZny5oFp5pB; sb=_ukEaIt0oqbw6wKP9ZDCQGqs; ps_l=1; ps_n=1; ar_debug=1; c_user=100051755359634; presence=C%7B%22t3%22%3A%5B%5D%2C%22utc3%22%3A1745417906996%2C%22v%22%3A1%7D; fr=18l2CnqH1U3kE0vFh.AWf60Zfuql4K5EJZz9tCiL5oEOMUFtk_CQ4hB59qFijMRBB3cxA.BoCPkE..AAA.0.0.BoCPkE.AWfm1RtyihH2YrUXFWIXorCpykI; xs=50%3AHmELAuPsvrwShw%3A2%3A1745414736%3A-1%3A6267%3A%3AAcWWuYoW2hx5484cjcYMMjZqffe4pt2kztewER0EVw; wd=1912x252`);
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
