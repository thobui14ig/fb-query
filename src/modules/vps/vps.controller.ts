import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { getUser } from 'src/common/utils/user';
import { VpsService } from './vps.service';

@Controller('vps')
export class VpsController {
    constructor(private readonly vpsService: VpsService) { }

    @Get()
    getAll(@Req() req: Request) {
        const user = getUser(req);
        return this.vpsService.getAll()
    }
}
