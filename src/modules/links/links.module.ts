import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DelayEntity } from '../setting/entities/delay.entity';
import { UserModule } from '../user/user.module';
import { LinkEntity } from './entities/links.entity';
import { LinkController } from './links.controller';
import { LinkService } from './links.service';

@Module({
  imports: [TypeOrmModule.forFeature([LinkEntity, DelayEntity]), forwardRef(() => UserModule)],
  controllers: [LinkController],
  providers: [LinkService],
  exports: [LinkService],
})
export class LinkModule { }
