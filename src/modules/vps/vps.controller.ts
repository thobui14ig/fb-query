import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { getUser } from 'src/common/utils/user';
import { VpsService } from './vps.service';
import { CreateVpsDto } from './dto/create-page.dto';

@Controller('vps')
export class VpsController {
    constructor(private readonly vpsService: VpsService) { }

    @Get()
    getAll(@Req() req: Request) {
        const user = getUser(req);
        return this.vpsService.getAll()
    }

    @Post()
    create(@Body() body: CreateVpsDto, @Req() req: Request) {
        const user = getUser(req);
        return this.vpsService.create(body, user.id)
    }


    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.vpsService.remove(+id);
    }
}
