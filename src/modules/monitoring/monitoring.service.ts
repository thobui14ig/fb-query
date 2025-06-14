import { HttpException, HttpStatus, Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { CommentEntity } from '../comments/entities/comment.entity';
import { CookieEntity, CookieStatus } from '../cookie/entities/cookie.entity';
import { FacebookService } from '../facebook/facebook.service';
import {
  LinkEntity,
  LinkStatus,
  LinkType
} from '../links/entities/links.entity';
import { ProxyEntity, ProxyStatus } from '../proxy/entities/proxy.entity';
import { DelayEntity } from '../setting/entities/delay.entity';
import { TokenEntity, TokenHandle, TokenStatus } from '../token/entities/token.entity';
import { LEVEL } from '../user/entities/user.entity';
import { ProcessDTO } from './dto/process.dto';
import { GroupedLinksByType } from './monitoring.service.i';
import { isNumber } from 'class-validator';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import { EventEmitter2 } from '@nestjs/event-emitter';
const proxy_check = require('proxy-check');

dayjs.extend(utc);

type RefreshKey = 'refreshToken' | 'refreshCookie' | 'refreshProxy';
@Injectable()
export class MonitoringService {
  constructor(
    @InjectRepository(LinkEntity)
    private linkRepository: Repository<LinkEntity>,
    @InjectRepository(DelayEntity)
    private delayRepository: Repository<DelayEntity>,
  ) {
  }


  async updateProcess(processDTO: ProcessDTO, level: LEVEL, userId: number) {
    if (level === LEVEL.USER) {
      const link = await this.linkRepository.findOne({
        where: {
          userId,
          id: processDTO.id
        },
      });

      if (!link) {
        throw new HttpException(`Bạn không có quyền.`, HttpStatus.CONFLICT);
      }
    }

    const link = await this.linkRepository.findOne({
      where: {
        id: processDTO.id
      },
    });
    const delayTime = await this.getDelayTime(processDTO.status, link.type)
    const dataUpdate = { ...processDTO, delayTime }

    const response = await this.linkRepository.save(dataUpdate);

    throw new HttpException(
      `${response.status === LinkStatus.Started ? 'Start' : 'Stop'} monitoring for link_id ${processDTO.id}`,
      HttpStatus.OK,
    );
  }

  async getDelayTime(status: LinkStatus, type: LinkType) {
    const setting = await this.delayRepository.find()
    return status === LinkStatus.Pending ? setting[0].delayOff * 60 : (type === LinkType.PUBLIC ? setting[0].delayOnPublic : setting[0].delayOnPrivate)
  }
}
