import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { PageService } from './page.service';
import { CreatePageDto } from './dto/create-page.dto';

@Controller('pages')
export class PageController {
    constructor(private readonly pageService: PageService) { }

    @Get()
    getAll() {
        return this.pageService.getAll()
    }

    @Post()
    create(@Body() body: CreatePageDto) {
        return this.pageService.create(body)
    }


    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.pageService.remove(+id);
    }
}
