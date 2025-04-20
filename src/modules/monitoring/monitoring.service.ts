import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ProcessDTO } from './dto/process.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import {
  LinkEntity,
  LinkStatus,
  LinkType,
} from '../links/entities/links.entity';
import { LEVEL } from '../user/entities/user.entity';
import { FacebookService } from '../facebook/facebook.service';

@Injectable()
export class MonitoringService {
  constructor(
    @InjectRepository(LinkEntity)
    private linkRepository: Repository<LinkEntity>,
    private readonly facebookService: FacebookService,
  ) {}

  async updateProcess(processDTO: ProcessDTO, level: LEVEL, userId: number) {
    if (level === LEVEL.USER) {
      const link = await this.linkRepository.findOne({
        where: {
          userId,
        },
      });

      if (!link) {
        throw new HttpException(`Bạn không có quyền.`, HttpStatus.CONFLICT);
      }
    }

    const response = await this.linkRepository.save(processDTO);

    throw new HttpException(
      `${response.status === LinkStatus.Started ? 'Start' : 'Stop'} monitoring for link_id ${processDTO.id}`,
      HttpStatus.OK,
    );
  }

  async startMonitoring() {
    const proxy = {
      protocol: 'http',
      host: '38.153.152.244',
      port: 9594,
      auth: {
        username: 'pchwrbfj',
        password: 'ochbgqn9v4w3',
      },
    };
    const listPost = await this.getPostValid();

    for (const link of listPost) {
      if (link.type === LinkType.PUBLIC) {
        const postId = `feedback:${link.postId}`;
        const encodedPostId = Buffer.from(postId, 'utf-8').toString('base64');
        const comment = await this.facebookService.getCmt(encodedPostId, proxy);
        console.log(
          '🚀 ~ MonitoringService ~ startMonitoring ~ comment:',
          comment,
        );
      }
    }
  }

  private getPostValid() {
    return this.linkRepository.find({
      where: {
        status: LinkStatus.Started,
        postId: Not(IsNull()),
      },
    });
  }
}
