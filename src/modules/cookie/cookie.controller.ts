import { Controller, Get, Post, Body, Patch, Param, Delete, Put } from '@nestjs/common';
import { CookieService } from './cookie.service';
import { CreateCookieDto } from './dto/create-cookie.dto';
import { UpdateCookieDto } from './dto/update-cookie.dto';

@Controller('cookies')
export class CookieController {
  constructor(private readonly cookieService: CookieService) { }

  @Post()
  create(@Body() createCookieDto: CreateCookieDto) {
    return this.cookieService.create(createCookieDto);
  }

  @Get()
  findAll() {
    return this.cookieService.findAll();
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
