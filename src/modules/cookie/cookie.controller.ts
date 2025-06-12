import { Controller, Get, Post, Body, Patch, Param, Delete, Put, Req } from '@nestjs/common';
import { CookieService } from './cookie.service';
import { CreateCookieDto } from './dto/create-cookie.dto';
import { UpdateCookieDto } from './dto/update-cookie.dto';
import { getUser } from 'src/common/utils/user';
import { Request } from 'express';

@Controller('cookies')
export class CookieController {
  constructor(private readonly cookieService: CookieService) { }

  @Post()
  create(@Body() createCookieDto: CreateCookieDto, @Req() req: Request) {
    const user = getUser(req);

    return this.cookieService.create(createCookieDto, user.id, user.level);
  }

  @Get()
  findAll(@Req() req: Request) {
    const user = getUser(req);
    return this.cookieService.findAll(user.level, user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cookieService.findOne(+id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateCookieDto: UpdateCookieDto) {
    return this.cookieService.update(+id, updateCookieDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cookieService.remove(+id);
  }
}
