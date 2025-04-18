import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { jwtConstants } from './auth.module';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from 'src/common/guard/guard';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwtService: JwtService, private reflector: Reflector) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }


    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException();
    }
    try {
      const { iat, exp, ...payload } = await this.jwtService.verifyAsync(token, {
        secret: jwtConstants.secret,
      });
      request['user'] = payload;
    } catch (err) {
      throw new UnauthorizedException();
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const cookieString = request.headers.cookie;
    if (cookieString) {
      const cookieToken = this.getValueByKeyInCookie(cookieString, 'token');

      if (cookieToken) {
        return cookieToken;
      }
    }

    const [type, token] = request.headers['authorization']?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }

  private getValueByKeyInCookie(cookieString: string, key: string) {
    const valueCookie = cookieString
      .split(';')
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(`${key}=`));

    let tokenValue: string | undefined;
    if (valueCookie) {
      const [, value] = valueCookie.split('=');
      tokenValue = value;
    }

    return tokenValue;
  }
}
