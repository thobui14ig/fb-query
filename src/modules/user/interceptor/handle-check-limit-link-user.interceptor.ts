// src/logging.interceptor.ts
import {
    CallHandler,
    ExecutionContext,
    HttpException,
    HttpStatus,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { UserService } from 'src/modules/user/user.service';
import { isNullOrUndefined } from 'src/common/utils/check-utils';
import { LinkService } from 'src/modules/links/links.service';
import { LinkStatus } from 'src/modules/links/entities/links.entity';

@Injectable()
export class CheckLimitLinkUserInterceptor implements NestInterceptor {
    constructor(private userService: UserService, private linkService: LinkService) { }

    async intercept(context: ExecutionContext, next: CallHandler) {
        const request = context.switchToHttp().getRequest();
        const body = request.body
        const { linkOnLimit, linkOffLimit } = body
        const { totalLinkOn, totalLinkOff } = await this.linkService.getTotalLinkUser(body["id"]) || {}

        if (linkOnLimit < totalLinkOn)
            throw new HttpException(
                `Link On đang chạy hiện tại đang là ${totalLinkOn}.`,
                HttpStatus.BAD_REQUEST,
            );
        if (linkOffLimit < totalLinkOff)
            throw new HttpException(
                `Link Off đang chạy hiện tại đang là ${totalLinkOff}.`,
                HttpStatus.BAD_REQUEST,
            );
        return next.handle()

    }
}
