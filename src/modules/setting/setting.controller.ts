import { Controller, Get, Post, Body, Patch, Param, Delete, Req } from '@nestjs/common';
import { SettingService } from './setting.service';
import { CreateKeywordDto } from './dto/create-keyword.dto';
import { Request } from 'express';
import { getUser } from 'src/common/helper/user';
import { CreateDelayDTO } from './dto/create-delay.dto';

@Controller('setting')
export class SettingController {
  constructor(private readonly settingService: SettingService) { }

  @Post('/create-keyword')
  createKeyword(@Req() req: Request, @Body() createKeywordDto: CreateKeywordDto) {
    const user = getUser(req);
    return this.settingService.createKeyword(createKeywordDto, user.id);
  }

  @Post('/create-delay')
  createDelay(@Req() req: Request, @Body() createDelayDto: CreateDelayDTO) {
    const user = getUser(req);
    return this.settingService.createDelay(createDelayDto);
  }

  @Get('get-keywords')
  getKeywords(@Req() req: Request,) {
    const user = getUser(req);
    return this.settingService.getKeywords(user.id);
  }

  @Get('get-delay')
  getDelay() {
    return this.settingService.getDelay();
  }
}
