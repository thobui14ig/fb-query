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
} from '@nestjs/common';
import { Request } from 'express';
import { getUser } from 'src/common/utils/user';
import { CreateLinkDTO } from './dto/create-link.dto';
import { UpdateLinkDTO } from './dto/update-link.dto';
import { HideBy, LinkStatus, LinkType } from './entities/links.entity';
import { LinkService } from './links.service';
import { BodyLinkQuery } from './links.service.i';

@Controller('links')
export class LinkController {
  constructor(private readonly linkService: LinkService) { }

  @Post()
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
  getLinks(@Req() req: Request, @Body() body: BodyLinkQuery, @Query('status') status: LinkStatus, @Query('isFilter') isFilter: number, @Query('hideCmt') hideCmt: number) {
    const user = getUser(req);

    return this.linkService.getAll(status, body, user.level, user.id, !!Number(isFilter), !!Number(hideCmt));
  }

  @Put()
  updateUser(@Req() req: Request, @Body() updateLinkDto: UpdateLinkDTO) {
    const user = getUser(req);
    return this.linkService.update(updateLinkDto, user.level);
  }

  @Delete('/:id')
  deleteUser(@Param('id') id: number) {
    return this.linkService.delete(id);
  }

  @Post('/hide-cmt/:linkId')
  hideCmt(@Req() req: Request, @Param('linkId') linkId: number, @Query('type') type: HideBy) {
    const user = getUser(req);

    return this.linkService.hideCmt(linkId, type, user.id)
  }


  @Get('get-keywords/:id')
  getkeywordsByLink(@Param('id') id: number) {
    return this.linkService.getkeywordsByLink(id);
  }
}
