import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as dayjs from 'dayjs';
import { Response } from 'express';
import { LEVEL, UserEntity } from '../user/entities/user.entity';
import { UserService } from '../user/user.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UserService,
    private jwtService: JwtService,
  ) { }

  async signIn(username: string, pass: string) {
    const { password, ...user } = await this.usersService.findByEmail(username) || {};

    console.log("🚀 ~ AuthService ~ signIn ~ user:", user)
    if (!user || password !== pass) {
      throw new UnauthorizedException();
    }
    const isExpireDate = dayjs().format('DD-MM-YYYY') > dayjs(user.expiredAt).format('DD-MM-YYYY');
    console.log("🚀 ~ AuthService ~ signIn ~ isExpireDate:", dayjs().format('DD-MM-YYYY'))
    console.log("🚀 ~ AuthService ~ signIn ~ isExpireDate:", dayjs(user.expiredAt).format('DD-MM-YYYY'))

    console.log("🚀 ~ AuthService ~ signIn ~ isExpireDate:", isExpireDate)

    if (isExpireDate) {
      throw new HttpException(
        `User hết hạn`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const payload = { ...user };

    return {
      token: await this.createToken(payload),
      info: {
        ...user
      }
    }
  }

  async createToken(payload: Omit<Partial<UserEntity>, 'password'>) {
    return {
      accessToken: await this.jwtService.signAsync(payload, {
        expiresIn: '1d',
      }),
      refreshToken: await this.jwtService.signAsync(payload, {
        expiresIn: '7d',
      }),
    };
  }

  async refreshToken(refresh_token: string, res: Response) {
    try {
      const decodedToken = this.jwtService.verify(refresh_token);
      const refreshTokenExp = decodedToken.exp;
      const currentTime = Math.floor(Date.now() / 1000);
      if (currentTime > refreshTokenExp) {
        return res.status(402).json({ refresh: false });
      }

      const payload = { ...decodedToken };
      const { accessToken, refreshToken } = await this.createToken(payload);

      res.setHeader('Set-Cookie', [`token=${accessToken}; HttpOnly; Path=/`]);

      return res.send({ refreshToken });
    } catch (error) {
      return res.status(402).json({ message: 'Refresh token đã hết hạn' });
    }
  }
}
