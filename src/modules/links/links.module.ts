import { Module } from '@nestjs/common';
import { LinkService } from './links.service';
import { LinkEntity } from './entities/links.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LinkController } from './links.controller';
import { DelayEntity } from '../setting/entities/delay.entity';
import { CookieEntity } from '../cookie/entities/cookie.entity';
import { FacebookModule } from '../facebook/facebook.module';
import { CommentEntity } from '../comments/entities/comment.entity';
import { KeywordEntity } from '../setting/entities/keyword';
import { UserModule } from '../user/user.module';

@Module({
  imports: [TypeOrmModule.forFeature([LinkEntity, DelayEntity, CookieEntity, CommentEntity, KeywordEntity]), FacebookModule, UserModule],
  controllers: [LinkController],
  providers: [LinkService],
  exports: [LinkService],
})
export class LinkModule { }
