import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from "@nestjs/common";
import { LinkService } from "./links.service";
import { CreateLinkDTO } from "./dto/create-link.dto";
import { Request } from "express";
import { getUser } from "src/common/helper/user";
import { UpdateLinkDTO } from "./dto/update-link.dto";
import { LinkStatus } from "./entities/links.entity";

@Controller('links')
export class LinkController {
    constructor(private readonly linkService: LinkService) { }

    @Post()
    create(@Req() req: Request, @Body() createLinkDto: CreateLinkDTO) {
        const response = getUser(req);
        return this.linkService.create({
            ...createLinkDto,
            userId: response.id
        })
    }

    @Get('/:id')
    getUser(@Param('id') id: number) {
        return this.linkService.getOne(id)
    }

    @Get()
    getLinks(@Query("status") status: LinkStatus) {
        return this.linkService.getAll(status)
    }

    @Get('/info')
    getUserInfo(@Req() req: Request) { }

    @Put()
    updateUser(@Req() req: Request, @Body() updateLinkDto: UpdateLinkDTO) {
        const user = getUser(req);
        return this.linkService.update(updateLinkDto, user.level)
    }

    @Delete('/:id')
    deleteUser(@Param('id') id: number) {
        return this.linkService.delete(id)
    }
}