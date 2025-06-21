import { Module } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommentEntity } from './entities/comment.entity';
import { CookieEntity } from '../cookie/entities/cookie.entity';
import { FacebookModule } from '../facebook/facebook.module';

@Module({
  imports: [TypeOrmModule.forFeature([CommentEntity]), FacebookModule],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule { }
