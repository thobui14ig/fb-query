import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as dayjs from 'dayjs';
import { Response } from 'express';
import { LEVEL, UserEntity } from '../user/entities/user.entity';
import { UserService } from '../user/user.service';

interface IUserFail {
  username: string,
  numberOfTime: number,
  time: string
}
@Injectable()
export class AuthService {
  usersFail: IUserFail[] = []
  constructor(
    private usersService: UserService,
    private jwtService: JwtService,
  ) { }

  async signIn(username: string, pass: string) {
    const { password, ...user } = await this.usersService.findByEmail(username) || {};
    const userFail = this.usersFail.find(item => item.username === username)

    if (userFail && userFail.numberOfTime == 2 && dayjs().isBefore(dayjs(userFail.time).add(1, "minute"))) {
      throw new HttpException(
        `Vui lòng thử lại sau`,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (userFail && userFail.numberOfTime == 2) {
      this.usersFail = this.usersFail.filter(item => item.username !== username)
    }

    if (!user || password !== pass) {
      if (userFail) {
        userFail.time = dayjs().format('YYYY-MM-DD HH:mm:ss')
        userFail.numberOfTime = userFail.numberOfTime + 1
      } else {
        const arg = {
          username: username,
          numberOfTime: 1,
          time: dayjs().format('YYYY-MM-DD HH:mm:ss')
        }
        this.usersFail.push(arg)
      }

      throw new HttpException(
        `Thông tin đăng nhập không hợp lệ`,
        HttpStatus.BAD_REQUEST,
      );
    }
    this.usersFail = this.usersFail.filter(item => item.username !== username)
    const isExpireDate = dayjs(dayjs(), 'DD-MM-YYYY').format('YYYY-MM-DD') >
      dayjs(user.expiredAt, 'DD-MM-YYYY').format('YYYY-MM-DD');
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
