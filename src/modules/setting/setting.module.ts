import { Module } from '@nestjs/common';
import { SettingService } from './setting.service';
import { SettingController } from './setting.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KeywordEntity } from './entities/keyword';
import { DelayEntity } from './entities/delay.entity';

@Module({
  imports: [TypeOrmModule.forFeature([KeywordEntity, DelayEntity])],

  controllers: [SettingController],
  providers: [SettingService],
})
export class SettingModule { }
