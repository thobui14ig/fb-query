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
import { LinkService } from './links.service';
import { CreateLinkDTO } from './dto/create-link.dto';
import { Request } from 'express';
import { getUser } from 'src/common/utils/user';
import { UpdateLinkDTO } from './dto/update-link.dto';
import { LinkStatus } from './entities/links.entity';

@Controller('links')
export class LinkController {
  constructor(private readonly linkService: LinkService) {}

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

  @Get()
  getLinks(@Req() req: Request, @Query('status') status: LinkStatus) {
    const user = getUser(req);

    return this.linkService.getAll(status, user.level, user.id);
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
}
