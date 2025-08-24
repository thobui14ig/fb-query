import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommentEntity } from '../comments/entities/comment.entity';
import { FacebookModule } from '../facebook/facebook.module';
import { LinkEntity } from '../links/entities/links.entity';
import { TokenEntity } from '../token/entities/token.entity';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';
import { CookieEntity } from '../cookie/entities/cookie.entity';
import { ProxyEntity } from '../proxy/entities/proxy.entity';
import { DelayEntity } from '../setting/entities/delay.entity';
import { HttpModule } from '@nestjs/axios';
import { UserModule } from '../user/user.module';
import { LinkModule } from '../links/links.module';
import { VpsEntity } from '../vps/entities/vps.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LinkEntity, CommentEntity, TokenEntity, CookieEntity, ProxyEntity, DelayEntity, VpsEntity]), FacebookModule, HttpModule, UserModule, LinkModule],
  controllers: [MonitoringController],
  providers: [MonitoringService],
  exports: [MonitoringService],
})
export class MonitoringModule { }
