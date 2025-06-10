import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as dayjs from 'dayjs';
import * as timezone from 'dayjs/plugin/timezone';
import * as utc from 'dayjs/plugin/utc';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { DelayEntity } from '../setting/entities/delay.entity';
import { LEVEL } from '../user/entities/user.entity';
import { UpdateLinkDTO } from './dto/update-link.dto';
import { HideBy, LinkEntity, LinkStatus, LinkType } from './entities/links.entity';
import { BodyLinkQuery, CreateLinkParams, ISettingLinkDto } from './links.service.i';
import { CookieEntity } from '../cookie/entities/cookie.entity';
import { FacebookService } from '../facebook/facebook.service';
import { CommentEntity } from '../comments/entities/comment.entity';
import { KeywordEntity } from '../setting/entities/keyword';
import { link } from 'fs';

dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class LinkService {
  ukTimezone = 'Asia/Ho_Chi_Minh';
  constructor(
    @InjectRepository(LinkEntity)
    private repo: Repository<LinkEntity>,
    @InjectRepository(DelayEntity)
    private delayRepository: Repository<DelayEntity>,
    private connection: DataSource,
    @InjectRepository(CookieEntity)
    private cookieRepository: Repository<CookieEntity>,
    @InjectRepository(CommentEntity)
    private commentRepository: Repository<CommentEntity>,
    @InjectRepository(KeywordEntity)
    private keywordRepository: Repository<KeywordEntity>,
    private facebookService: FacebookService
  ) { }

  async create(params: CreateLinkParams) {
    const config = await this.delayRepository.find();
    const linkEntities: Partial<LinkEntity>[] = []
    const linksInValid = [];

    for (const link of params.links) {
      const isExitLink = await this.repo.findOne({
        where: {
          linkUrl: link.url,
          userId: params.userId
        }
      })

      if (!isExitLink) {
        const entity: Partial<LinkEntity> = {
          userId: params.userId,
          linkUrl: link.url,
          delayTime: params.status === LinkStatus.Started ? config[0].delayOnPublic ?? 10 : config[0].delayOff ?? 10,
          status: params.status,
          linkName: link.name,
          hideCmt: params.hideCmt
        }
        linkEntities.push(entity)
        continue
      }

      linksInValid.push(link.url)
    }

    const seenUrls = new Set<string>();
    const uniqueLinks: Partial<LinkEntity>[] = [];

    for (const link of linkEntities) {
      if (link.linkUrl && !seenUrls.has(link.linkUrl)) {
        seenUrls.add(link.linkUrl);
        uniqueLinks.push(link);
      }
    }

    await this.repo.save(uniqueLinks);
    if (linksInValid.length > 0) {
      throw new HttpException(
        `Thêm thành công ${linkEntities.length}, Link bị trùng: [${linksInValid.join(',')}]`,
        HttpStatus.BAD_REQUEST,
      );
    }
    throw new HttpException(
      `Thêm thành công ${linkEntities.length} link`,
      HttpStatus.OK,
    );
  }

  getOne(id: number) {
    return this.repo.findOne({
      where: {
        id,
      },
    });
  }

  async getAll(status: LinkStatus, body: BodyLinkQuery, level: LEVEL, userIdByUerLogin: number, isFilter: boolean, hideCmt: boolean) {
    const { type, userId, delayFrom, delayTo, differenceCountCmtFrom, differenceCountCmtTo, lastCommentFrom, lastCommentTo, likeFrom, likeTo } = body
    let queryEntends = ``
    if (hideCmt) {
      queryEntends += ` l.hide_cmt = true`
    } else {
      queryEntends += ` l.hide_cmt = false`
    }
    if (status === LinkStatus.Started) {
      queryEntends += ` AND l.status = 'started'`
    }
    if (status === LinkStatus.Pending) {
      queryEntends += ` AND l.status = 'pending'`
    }

    if (differenceCountCmtFrom && differenceCountCmtTo) {
      queryEntends += ` AND l.count_after between ${differenceCountCmtFrom} and ${differenceCountCmtTo}`
    }

    if (likeFrom && likeTo) {
      queryEntends += ` AND l.like_after between ${likeFrom} and ${likeTo}`
    }

    if (isFilter) {
      if (level === LEVEL.ADMIN) {
        if (type) {
          queryEntends += ` AND l.type='${type}'`
        }
        if (userId) {
          queryEntends += ` AND l.user_id=${userId}`
        }
        if (delayFrom && delayTo) {
          queryEntends += ` AND l.delay_time between ${delayFrom} and ${delayTo}`
        }
      }
    }
    if (level === LEVEL.USER) {
      queryEntends += ` AND l.user_id = ${userIdByUerLogin}`
    }

    let response: any[] = await this.connection.query(`
        SELECT 
            l.id,
            l.error_message as errorMessage,
            l.link_name as linkName,
            l.link_url as linkUrl,
            l.like,
            l.post_id as postId,
            l.delay_time as delayTime,
            l.status,
            l.created_at as createdAt,
            l.last_comment_time as lastCommentTime,
            l.process,
            l.type,
            u.email, 
            l.count_before AS countBefore,
            l.count_after AS countAfter,
            l.like_before AS likeBefore,
            l.like_after AS likeAfter,
            l.hide_cmt as hideCmt,
            l.hide_by as hideBy
        FROM 
            links l
        JOIN 
            users u ON u.id = l.user_id
        LEFT JOIN 
            comments c ON c.link_id = l.id
        WHERE ${queryEntends}
        GROUP BY 
            l.id, u.email
            order by l.id desc
      `, [])

    const res = response.map((item) => {
      const now = dayjs().utc()
      const utcLastCommentTime = dayjs.utc(item.lastCommentTime);
      const diff = now.diff(utcLastCommentTime, 'minute')
      const utcTimeCreate = dayjs(item.createdAt).format('YYYY-MM-DD HH:mm:ss')


      return {
        ...item,
        createdAt: dayjs.utc(utcTimeCreate).format('YYYY-MM-DD HH:mm:ss'),
        lastCommentTime: item.lastCommentTime ? diff : null
      }
    })

    if (lastCommentFrom && lastCommentTo) {
      return res.filter((item) => item.lastCommentTime >= lastCommentFrom && item.lastCommentTime <= lastCommentTo)
    }

    return res
  }

  update(params: UpdateLinkDTO, level: LEVEL) {
    const argUpdate: Partial<LinkEntity> = {};
    argUpdate.id = params.id;
    argUpdate.linkName = params.linkName;
    argUpdate.hideCmt = params.hideCmt;

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

  async hideCmt(linkId: number, type: HideBy, userId: number) {
    const link = await this.repo.findOne({
      where: {
        id: linkId
      }
    })
    if (link) {
      link.hideBy = type
      return this.repo.save(link)
    }

    return null
  }

  getkeywordsByLink(linkId: number) {
    return this.repo.findOne({
      where: {
        id: linkId
      },
      relations: {
        keywords: true
      }
    })
  }

  async settingLink(setting: ISettingLinkDto) {
    if (setting.isDelete) {
      return this.repo.delete(setting.linkIds)
    }

    const links = await this.repo.find({
      where: {
        id: In(setting.linkIds)
      }
    })

    const newLinks = links.map((item) => {
      if (setting.onOff) {
        item.status = LinkStatus.Started
      } else {
        item.status = LinkStatus.Pending
      }

      if (setting.delay) {
        item.delayTime = setting.delay
      }

      return item
    })

    return this.repo.save(newLinks)
  }
}
