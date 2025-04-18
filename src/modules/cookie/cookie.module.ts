import { Module } from '@nestjs/common';
import { CookieService } from './cookie.service';
import { CookieController } from './cookie.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CookieEntity } from './entities/cookie.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CookieEntity])],
  controllers: [CookieController],
  providers: [CookieService],
})
export class CookieModule { }
