import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as dayjs from 'dayjs';
import * as timezone from 'dayjs/plugin/timezone';
import * as utc from 'dayjs/plugin/utc';
import { DataSource, IsNull, Not, Repository } from 'typeorm';
import { DelayEntity } from '../setting/entities/delay.entity';
import { LEVEL } from '../user/entities/user.entity';
import { UpdateLinkDTO } from './dto/update-link.dto';
import { LinkEntity, LinkStatus, LinkType } from './entities/links.entity';
import { BodyLinkQuery, CreateLinkParams, EKeyHideCmt } from './links.service.i';
import { CookieEntity } from '../cookie/entities/cookie.entity';
import { FacebookService } from '../facebook/facebook.service';
import { CommentEntity } from '../comments/entities/comment.entity';
import { KeywordEntity } from '../setting/entities/keyword';

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
      queryEntends += `(l.status = 'started' or l.status = 'pending') AND l.hide_cmt = true`
    } else {
      if (status === LinkStatus.Started) {
        queryEntends += ` l.status = 'started' and l.hide_cmt = false`
      }
      if (status === LinkStatus.Pending) {
        queryEntends += ` l.status = 'pending' and l.hide_cmt = false`
      }
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
            l.hide_cmt as hideCmt
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

  async hideCmt(linkId: number, type: EKeyHideCmt, userId: number) {
    const cookie = await this.cookieRepository.findOne({
      where: {
        createdBy: userId
      }
    })
    if (!cookie) {
      throw new HttpException(
        `không tìm thấy cookie.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    let comments = null
    if (type === EKeyHideCmt.ALL) {
      comments = await this.commentRepository.find({
        where: {
          linkId
        }
      })
    }

    if (type === EKeyHideCmt.PHONE) {
      comments = await this.connection.query(`select cmtid as cmtId from comments where link_id = ${linkId} and phone_number is not null`)
    }


    if (type === EKeyHideCmt.KEYWORD) {
      const keywords = await this.keywordRepository.find({
        where: {
          userId
        }
      })

      if (!keywords.length) {
        throw new HttpException(
          `không tìm thấy keywords.`,
          HttpStatus.BAD_REQUEST,
        );
      }
      let likeString = ''
      for (let i = 0; i < keywords.length; i++) {
        const keyword = keywords[i]
        if (i === 0) {
          likeString += `'\\\\b${keyword.keyword}\\\\b'`;
          continue;
        }

        likeString += ` or message RLIKE '\\\\b${keyword.keyword}\\\\b'`;
      }

      comments = await this.connection.query(`select cmtid as cmtId from comments where link_id = ${linkId} and (message RLIKE ${likeString})`)
    }

    if (comments.length === 0) {
      throw new HttpException(
        `Không có comment nào để ẩn`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    for (const comment of comments) {
      const res = await this.facebookService.hideCmt(comment.cmtId, cookie)
      if (res?.errors?.length > 0 && res?.errors[0].code === 1446036) {
        throw new HttpException(
          `Comment đã được ẩn.`,
          HttpStatus.BAD_GATEWAY,
        );
      }
      await this.commentRepository.save({ ...comment, hideCmt: true })
    }
  }
}
