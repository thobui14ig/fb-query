import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CreateAuthDto } from './dto/create-auth.dto';
import { Response } from 'express';
import { UserService } from '../user/user.service';
import { UserEntity } from '../user/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UserService,
    private jwtService: JwtService,
  ) { }

  async signIn(email: string, pass: string) {
    const { password, ...user } = await this.usersService.findByEmail(email) || {};

    console.log("🚀 ~ AuthService ~ signIn ~ password:", password, user, !user || password !== pass)
    if (!user || password !== pass) {
      throw new UnauthorizedException();
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
