import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokenEntity } from '../token/entities/token.entity';
import { FacebookService } from './facebook.service';
import { CookieEntity } from '../cookie/entities/cookie.entity';
import { ProxyEntity } from '../proxy/entities/proxy.entity';

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([TokenEntity, CookieEntity, ProxyEntity])],
  controllers: [],
  providers: [FacebookService],
  exports: [FacebookService],
})
export class FacebookModule { }
