import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LinkEntity, LinkStatus } from './entities/links.entity';
import { CreateLinkParams } from './links.service.i';
import { UpdateLinkDTO } from './dto/update-link.dto';
import { LEVEL } from '../user/entities/user.entity';

@Injectable()
export class LinkService {
  constructor(
    @InjectRepository(LinkEntity)
    private repo: Repository<LinkEntity>,
  ) { }

  create(params: CreateLinkParams) {
    const entities: Partial<LinkEntity>[] = params.links.map((item) => {
      return {
        userId: params.userId,
        linkName: item.url,
        linkUrl: item.url,
        delayTime: item.delayTime,
        status: params.status,
      };
    });
    return this.repo.save(entities);
  }

  getOne(id: number) {
    return this.repo.findOne({
      where: {
        id,
      },
    });
  }

  getAll(status: LinkStatus, level: LEVEL, userId: number) {
    if (level === LEVEL.ADMIN) {
      return this.repo.find({
        where: {
          status,
        },
        relations: {
          user: true,
        },
        select: {
          id: true,
          linkName: true,
          linkUrl: true,
          like: true,
          postId: true,
          delayTime: true,
          status: true,
          createdAt: true,
          commentCount: true,
          lastCommentTime: true,
          process: true,
          type: true,
          user: {
            email: true,
          },
          userId: true,
        },
        order: {
          id: 'DESC',
        },
      });
    }

    return this.repo.find({
      where: {
        status,
        userId,
      },
      relations: {
        user: true,
      },
      select: {
        id: true,
        linkName: true,
        linkUrl: true,
        like: true,
        postId: true,
        delayTime: true,
        status: true,
        createdAt: true,
        commentCount: true,
        lastCommentTime: true,
        process: true,
        type: true,
        user: {
          email: true,
        },
        userId: true,
      },
      order: {
        id: 'DESC',
      },
    });
  }

  update(params: UpdateLinkDTO, level: LEVEL) {
    const argUpdate: Partial<LinkEntity> = {};
    argUpdate.id = params.id;
    argUpdate.linkName = params.linkName;

    if (level === LEVEL.ADMIN) {
      argUpdate.delayTime = params.delayTime;
      argUpdate.type = params.type;
    }

    return this.repo.save(argUpdate);
  }

  delete(id: number) {
    //chưa xử lý stop_monitoring
    return this.repo.delete(id);
  }
}
