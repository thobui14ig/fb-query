import { Body, Controller, Post, Req } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { ProcessDTO } from './dto/process.dto';
import { getUser } from 'src/common/utils/user';
import { Request } from 'express';

@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) { }

  @Post('/process')
  updateProcess(@Req() req: Request, @Body() processDTO: ProcessDTO) {
    const user = getUser(req);
    return this.monitoringService.updateProcess(
      processDTO,
      user.level,
      user.id,
    );
  }
}
