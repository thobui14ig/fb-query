import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ProxyService } from './proxy.service';
import { CreateProxyDto } from './dto/create-proxy.dto';
import { UpdateProxyDto } from './dto/update-proxy.dto';

@Controller('proxies')
export class ProxyController {
  constructor(private readonly proxyService: ProxyService) { }

  @Post()
  create(@Body() createProxyDto: CreateProxyDto) {
    return this.proxyService.create(createProxyDto);
  }

  @Get()
  findAll() {
    return this.proxyService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.proxyService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateProxyDto: UpdateProxyDto) {
    return this.proxyService.update(+id, updateProxyDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.proxyService.remove(+id);
  }
}
