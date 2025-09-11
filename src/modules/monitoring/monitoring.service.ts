import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import { Repository } from 'typeorm';
import {
  LinkEntity,
  LinkStatus,
  LinkType
} from '../links/entities/links.entity';
import { DelayEntity } from '../setting/entities/delay.entity';
import { LEVEL } from '../user/entities/user.entity';
import { ProcessDTO } from './dto/process.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LinkService } from '../links/links.service';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { VpsEntity, VpsStatus } from '../vps/entities/vps.entity';
import { ConfigService } from '@nestjs/config';
import { ENV } from './monitoring.service.i';

dayjs.extend(utc);

@Injectable()
export class MonitoringService {
  env: string = ENV.DEVELOPMENT

  constructor(
    @InjectRepository(LinkEntity)
    private linkRepository: Repository<LinkEntity>,
    @InjectRepository(DelayEntity)
    private delayRepository: Repository<DelayEntity>,
    private linkService: LinkService,
    private httpService: HttpService,
    @InjectRepository(VpsEntity)
    private vpsRepository: Repository<VpsEntity>,
    private configService: ConfigService
  ) {
    this.env = this.configService.get<string>('ENV');
  }


  async updateProcess(processDTO: ProcessDTO, level: LEVEL, userId: number) {
    const link = await this.linkRepository.findOne({
      where: {
        id: processDTO.id
      },
      relations: {
        user: true
      }
    });
    const delayTime = await this.getDelayTime(processDTO.status, link.type, link.user.delayOnPrivate, link.user.delayOnPublic)
    const dataUpdate = { ...processDTO, delayTime }
    const response = await this.linkRepository.save({ ...dataUpdate, createdAt: dayjs.utc().format('YYYY-MM-DD HH:mm:ss') as any });

    throw new HttpException(
      `${response.status === LinkStatus.Started ? 'Start' : 'Stop'} monitoring for link_id ${processDTO.id}`,
      HttpStatus.OK,
    );
  }

  async getDelayTime(status: LinkStatus, type: LinkType, delayOnPrivateUser: number, delayOnPublic: number) {
    const setting = await this.delayRepository.find()

    if (status === LinkStatus.Started && type === LinkType.PRIVATE) {
      return delayOnPrivateUser
    }

    if (status === LinkStatus.Pending && type === LinkType.PRIVATE) {
      return setting[0].delayOffPrivate
    }

    if (status === LinkStatus.Started && type === LinkType.PUBLIC) {
      return delayOnPublic
    }

    if (status === LinkStatus.Pending && type === LinkType.PUBLIC) {
      return setting[0].delayOff
    }
  }


  @Cron(CronExpression.EVERY_10_SECONDS)
  async startMonitoring() {
    let vpsLive = []
    if (this.env == ENV.DEVELOPMENT) {
      vpsLive = [{
        id: 1,
        ip: "localhost",
        port: 20000,
        status: VpsStatus.Live
      }]
    } else {
      vpsLive = await this.vpsRepository.find({
        where: {
          status: VpsStatus.Live
        }
      })
    }

    const postsStarted = await this.linkService.getPostStarted()
    if (!postsStarted?.length) return;

    const chunkSize = (postsStarted.length / vpsLive.length);
    let stt = 0
    for (let i = 0; i < postsStarted.length; i += chunkSize) {
      const chunk = postsStarted.slice(i, i + chunkSize);
      const linkIds = chunk.map(item => item.id)
      const vps = vpsLive[stt]
      try {
        await firstValueFrom(this.httpService.post(`http://${vps.ip}:${vps.port}/monitoring`, { linkIds }))
      } catch (e) { }
      stt = stt + 1
    }
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async checkStatusService() {
    if (this.env == ENV.DEVELOPMENT) return;

    const vpss = await this.vpsRepository.find()

    for (const vps of vpss as any) {
      try {
        try {
          const response = await firstValueFrom(this.httpService.get(`http://${vps.ip}:${vps.port}/health-check`))
          const { status, speed } = response.data
          vps.status = status ? VpsStatus.Live : VpsStatus.Die
          vps.speed = speed
        } catch (e) {
          vps.status = VpsStatus.Die
          vps.speed = 0
        }

        await this.vpsRepository.update(vps.id, { status: vps.status, speed: vps.speed })
      } catch (error) { }
    }
  }

}
