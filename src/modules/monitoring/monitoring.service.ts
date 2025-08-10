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

dayjs.extend(utc);

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
    const link = await this.linkRepository.findOne({
      where: {
        id: processDTO.id
      },
      relations: {
        user: true
      }
    });
    const delayTime = await this.getDelayTime(processDTO.status, link.type, link.user.delayOnPrivate)
    const dataUpdate = { ...processDTO, delayTime }
    const response = await this.linkRepository.save({ ...dataUpdate, createdAt: dayjs.utc().format('YYYY-MM-DD HH:mm:ss') as any });

    throw new HttpException(
      `${response.status === LinkStatus.Started ? 'Start' : 'Stop'} monitoring for link_id ${processDTO.id}`,
      HttpStatus.OK,
    );
  }

  async getDelayTime(status: LinkStatus, type: LinkType, delayOnPrivateUser: number) {
    const setting = await this.delayRepository.find()

    if (status === LinkStatus.Started && type === LinkType.PRIVATE) {
      return delayOnPrivateUser
    }

    if (status === LinkStatus.Pending && type === LinkType.PRIVATE) {
      return setting[0].delayOffPrivate
    }

    if (status === LinkStatus.Started && type === LinkType.PUBLIC) {
      return setting[0].delayOnPublic
    }

    if (status === LinkStatus.Pending && type === LinkType.PUBLIC) {
      return setting[0].delayOff
    }
  }
}
