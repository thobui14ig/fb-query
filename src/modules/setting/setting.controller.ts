import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { getUser } from 'src/common/utils/user';
import { CreateDelayDTO } from './dto/create-delay.dto';
import { CreateKeywordDto } from './dto/create-keyword.dto';
import { SettingService } from './setting.service';

@Controller('setting')
export class SettingController {
  constructor(private readonly settingService: SettingService) { }

  @Post('/create-keyword')
  createKeyword(
    @Req() req: Request,
    @Body() createKeywordDto: CreateKeywordDto,
  ) {
    const user = getUser(req);
    return this.settingService.createKeyword(createKeywordDto, user.id);
  }

  @Post('/create-keyword-link')
  createKeywordLink(
    @Req() req: Request,
    @Body() createKeywordDto: CreateKeywordDto,
  ) {
    const user = getUser(req);
    return this.settingService.createKeywordLink(createKeywordDto, user.id);
  }

  @Post('/create-delay')
  createDelay(@Body() createDelayDto: CreateDelayDTO) {
    return this.settingService.createDelay(createDelayDto);
  }

  @Get('get-keywords')
  getKeywords(@Req() req: Request) {
    const user = getUser(req);
    return this.settingService.getKeywords(user.id);
  }

  @Get('get-delay')
  getDelay() {
    return this.settingService.getDelay();
  }
}
