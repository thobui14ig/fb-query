import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CookieController } from './cookie.controller';
import { CookieService } from './cookie.service';
import { CookieEntity } from './entities/cookie.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CookieEntity])],
  controllers: [CookieController],
  providers: [CookieService],
})
export class CookieModule { }
