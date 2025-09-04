import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { getUser } from 'src/common/utils/user';
import { CreateLinkDTO } from './dto/create-link.dto';
import { UpdateLinkDTO } from './dto/update-link.dto';
import { HideBy, LinkStatus, LinkType } from './entities/links.entity';
import { LinkService } from './links.service';
import { BodyLinkQuery, ISettingLinkDto } from './links.service.i';
import { CheckLimitLinkUserWhenAddLinkInterceptor } from './interceptors/handle-check-limit-link-user-when-add-link.interceptor';
import { CheckLimitLinkUserWhenUpdateMultipleLinkInterceptor } from './interceptors/handle-check-limit-link-user-when-update-multiple-link.interceptor';

@Controller('links')
export class LinkController {
  constructor(private readonly linkService: LinkService) { }

  @Post()
  @UseInterceptors(CheckLimitLinkUserWhenAddLinkInterceptor)
  create(@Req() req: Request, @Body() createLinkDto: CreateLinkDTO) {
    const user = getUser(req);

    return this.linkService.create({
      ...createLinkDto,
      userId: user.id,
    });
  }

  @Get('/:id')
  getUser(@Param('id') id: number) {
    return this.linkService.getOne(id);
  }

  @Post('/query')
  getLinks(@Req() req: Request, @Body() body: BodyLinkQuery, @Query('status') status: LinkStatus, @Query('isFilter') isFilter: number, @Query('hideCmt') hideCmt: number, @Query('limit') limit: number, @Query('offset') offset: number) {
    const user = getUser(req);

    return this.linkService.getAll(status, body, user.level, user.id, !!Number(isFilter), !!Number(hideCmt), limit, offset);
  }

  @Put()
  updateLink(@Req() req: Request, @Body() updateLinkDto: UpdateLinkDTO) {
    const user = getUser(req);
    return this.linkService.update(updateLinkDto, user.level);
  }

  @Delete('/:id')
  deleteLink(@Param('id') id: number) {
    return this.linkService.delete(id);
  }

  @Post('/hide-cmt/:linkId')
  hideCmt(@Req() req: Request, @Param('linkId') linkId: number, @Query('type') type: HideBy) {
    const user = getUser(req);

    return this.linkService.hideCmt(linkId, type, user.id)
  }

  @Post('/setting-link')
  @UseInterceptors(CheckLimitLinkUserWhenUpdateMultipleLinkInterceptor)
  settingLink(@Body() body: ISettingLinkDto) {
    return this.linkService.settingLink(body)
  }

  @Post('/priority')
  priority(@Body() body: { priority: boolean, linkId: number }) {
    return this.linkService.priority(body)
  }

  @Get('get-keywords/:id')
  getkeywordsByLink(@Param('id') id: number) {
    return this.linkService.getkeywordsByLink(id);
  }
}
