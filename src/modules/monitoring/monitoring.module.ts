import { Module } from '@nestjs/common';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LinkEntity } from '../links/entities/links.entity';
import { FacebookModule } from '../facebook/facebook.module';
import { CommentEntity } from '../comments/entities/comment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LinkEntity, CommentEntity]), FacebookModule],
  controllers: [MonitoringController],
  providers: [MonitoringService],
  exports: [MonitoringService],
})
export class MonitoringModule { }
