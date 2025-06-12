import { HttpsProxyAgent } from "https-proxy-agent";
import { ProxyEntity } from "src/modules/proxy/entities/proxy.entity";

function extractPhoneNumber(text: string) {
    text = text.replace(/o/gi, '0');
    text = text.replace(/[^0-9]/g, '');

    const validNetworkCodes = [
        '099', '098', '097', '096', '095', '094', '093', '092', '091', '090',
        '089', '088', '087', '086', '085', '083', '082',
        '081', '080', '079', '078', '077', '076', '075', '074',
        '073', '072', '071', '070', '069', '068', '067', '066',
        '065', '064', '063', '062', '061', '060',
        '059', '058', '057', '056', '055', '054', '053', '052', '051', '050',
        '039', '038', '037', '036', '035', '034', '033', '032', '031', '030'
    ];

    for (const code of validNetworkCodes) {
        const index = text.indexOf(code);
        if (index !== -1) {
            const phoneNumber = text.slice(index, index + 10);
            if (phoneNumber.length === 10) {
                return phoneNumber;
            }
        }
    }

    return null;
}

function extractFacebookId(url: string): string | null {
    const patterns = [
        /\/videos\/(\d+)/,                         // video id
        /\/posts\/(pfbid\w+)/,                     // post with pfbid
        /facebook\.com\/(\d{10,})$/,               // plain user/page ID
        /facebook\.com\/(pfbid\w+)/,               // post with pfbid in URL directly
        /story\.php\?story_fbid=(\d+)/,            // story_fbid in query params
        /permalink\.php\/\?story_fbid=(\d+)/,      // story_fbid in permalink.php
        /permalink\.php\/?\?story_fbid=(\d+|pfbid\w+)/,
        /\/reel\/(\d+)/,                            // reel id
        /facebook\.com\/\d+\/posts\/(\d+)/
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            return match[1];
        }
    }

    return null;
}

function getHttpAgent(proxy: ProxyEntity) {
    const proxyArr = proxy?.proxyAddress.split(':')
    const agent = `http://${proxyArr[2]}:${proxyArr[3]}@${proxyArr[0]}:${proxyArr[1]}`
    const httpsAgent = new HttpsProxyAgent(agent);

    return httpsAgent;
}

function changeCookiesFb(cookies: string): Record<string, string> {
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

function formatCookies(cookies: Record<string, string>): string {
    return Object.entries(cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');
}

function decodeCommentId(encodedStr) {
    try {
        const decoded = Buffer.from(encodedStr, 'base64').toString('utf-8');

        const match = decoded.match(/^comment:.*_(\d+)$/);

        if (match && match[1]) {
            return match[1];
        } else {
            return null;
        }
    } catch (error) {
        console.error('Lỗi giải mã comment ID:', error.message);
        return null;
    }
}

export {
    extractPhoneNumber, extractFacebookId, getHttpAgent, changeCookiesFb, formatCookies, decodeCommentId
}