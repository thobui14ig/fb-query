import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { PageService } from './page.service';
import { CreatePageDto } from './dto/create-page.dto';
import { getUser } from 'src/common/utils/user';
import { Request } from 'express';

@Controller('pages')
export class PageController {
    constructor(private readonly pageService: PageService) { }

    @Get()
    getAll(@Req() req: Request) {
        const user = getUser(req);
        return this.pageService.getAll(user.id, user.level)
    }

    @Post()
    create(@Body() body: CreatePageDto, @Req() req: Request) {
        const user = getUser(req);
        return this.pageService.create(body, user.id)
    }


    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.pageService.remove(+id);
    }
}
