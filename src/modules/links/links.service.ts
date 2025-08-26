import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as dayjs from 'dayjs';
import * as timezone from 'dayjs/plugin/timezone';
import * as utc from 'dayjs/plugin/utc';
import { isNullOrUndefined } from 'src/common/utils/check-utils';
import { DataSource, In, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { DelayEntity } from '../setting/entities/delay.entity';
import { LEVEL } from '../user/entities/user.entity';
import { UpdateLinkDTO } from './dto/update-link.dto';
import { HideBy, LinkEntity, LinkStatus, LinkType } from './entities/links.entity';
import { BodyLinkQuery, CreateLinkParams, ISettingLinkDto } from './links.service.i';

dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class LinkService {
  vnTimezone = 'Asia/Bangkok';

  constructor(
    @InjectRepository(LinkEntity)
    private repo: Repository<LinkEntity>,
    @InjectRepository(DelayEntity)
    private delayRepository: Repository<DelayEntity>,
    private connection: DataSource,
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
          hideCmt: params.hideCmt,
          thread: params.thread,
        }
        if (params.hideCmt) {
          entity.tablePageId = params.tablePageId
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
    const { type, userId, delayFrom, delayTo, differenceCountCmtFrom, differenceCountCmtTo, lastCommentFrom, lastCommentTo, likeFrom, likeTo, diffTimeFrom, diffTimeTo, totalCmtTodayFrom, totalCmtTodayTo } = body
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
            l.content,
            l.post_id as postId,
            l.delay_time as delayTime,
            l.status,
            l.created_at AS createdAt,
            l.last_comment_time as lastCommentTime,
            l.process,
            l.type,
            u.username, 
            l.count_before AS countBefore,
            l.count_after AS countAfter,
            l.like_before AS likeBefore,
            l.like_after AS likeAfter,
            l.hide_cmt as hideCmt,
            l.hide_by as hideBy,
            l.time_craw_update as timeCrawUpdate,
            l.comment_count as totalComment,
            l.priority
        FROM 
            links l
        JOIN 
            users u ON u.id = l.user_id
        LEFT JOIN 
            comments c ON c.link_id = l.id
        WHERE ${queryEntends}
        GROUP BY 
            l.id, u.username
            order by l.created_at desc
      `, [])
    const linkComment = response.length > 0 ? await this.connection.query(`
      select l.id as linkId, count(c.id) as totalComment from links l 
        join comments c 
        on c.link_id = l.id
        where l.id in(${response?.map(item => item.id) ?? 0})
        group by l.id  
    `) : []

    const vnNowStart = dayjs().tz(this.vnTimezone)
    const vnNowEnd = dayjs().tz(this.vnTimezone)
    const startDate = vnNowStart.startOf('day').utc().format('YYYY-MM-DD HH:mm:ss');
    const endDate = vnNowEnd.endOf('day').utc().format('YYYY-MM-DD HH:mm:ss');
    const linkCommentToday = response.length > 0 ? await this.connection.query(`
      select l.id as linkId, count(c.id) as totalComment from links l 
        join comments c 
        on c.link_id = l.id
        where l.id in(${response?.map(item => item.id) ?? 0})
        and c.time_created between '${startDate}' and '${endDate}'
        group by l.id  
    `) : []
    const linkCommentMap = new Map(
      linkComment.map(lc => [lc.linkId, lc.totalComment])
    );
    const linkCommentTodayMap = new Map(
      linkCommentToday.map(lc => [lc.linkId, lc.totalComment])
    );
    const res = response.map((item) => {
      const now = dayjs().utc()
      const utcLastCommentTime = dayjs.utc(item.lastCommentTime);
      const utcTimeCraw = dayjs.utc(item.timeCrawUpdate);
      const diff = now.diff(utcLastCommentTime, 'hour')
      const diffTimeCraw = utcLastCommentTime.diff(utcTimeCraw, 'hour')
      const utcTime = dayjs(item.createdAt).format('YYYY-MM-DD HH:mm:ss')

      return {
        ...item,
        createdAt: dayjs.utc(utcTime).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss'),
        lastCommentTime: item.lastCommentTime ? diff : diff === 0 ? diff : 9999,
        totalCommentNewest: linkCommentMap.get(item.id) || 0,
        totalCommentToday: linkCommentTodayMap.get(item.id) || 0,
        timeCrawUpdate: item.timeCrawUpdate ? diffTimeCraw : 9999
      }
    })
    let result = res
    if ((!isNullOrUndefined(lastCommentFrom) && lastCommentFrom != "" as any) && (!isNullOrUndefined(lastCommentTo) && lastCommentTo != "" as any)) {
      result = result.filter((item) => !isNullOrUndefined(item.lastCommentTime) && item.lastCommentTime >= lastCommentFrom && item.lastCommentTime <= lastCommentTo)
    }
    if ((!isNullOrUndefined(totalCmtTodayFrom) && totalCmtTodayFrom != "" as any) && (!isNullOrUndefined(totalCmtTodayTo) && totalCmtTodayTo != "" as any)) {
      result = result.filter((item) => !isNullOrUndefined(item.totalCommentToday) && item.totalCommentToday >= totalCmtTodayFrom && item.totalCommentToday <= totalCmtTodayTo)
    }

    if ((!isNullOrUndefined(diffTimeFrom) && diffTimeFrom != "" as any) && (!isNullOrUndefined(diffTimeTo) && diffTimeTo != "" as any)) {
      result = result.filter((item) => {
        const condition = item.countAfter - (item.totalCommentNewest - item.totalComment)

        return condition >= diffTimeFrom && condition <= diffTimeTo
      })
    }

    return result
  }

  update(params: UpdateLinkDTO, level: LEVEL) {
    const argUpdate: Partial<LinkEntity> = {};
    argUpdate.id = params.id;
    argUpdate.linkName = params.linkName;
    argUpdate.hideCmt = params.hideCmt;

    if (level === LEVEL.ADMIN) {
      argUpdate.delayTime = params.delayTime;
      argUpdate.type = params.type;
      argUpdate.thread = params.thread
    }

    if (params.hideCmt && params.tablePageId) {
      argUpdate.tablePageId = params.tablePageId
    }

    return this.connection.transaction(async (manager) => {
      const record = await manager
        .getRepository(LinkEntity)
        .createQueryBuilder("e")
        .setLock("pessimistic_write")
        .where("e.id = :id", { id: argUpdate.id })
        .getOneOrFail();

      Object.assign(record, argUpdate);

      await manager.save(record);
    });
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
      if (setting.onOff && setting.type === LinkStatus.Pending) {
        item.status = LinkStatus.Started
        item.createdAt = dayjs.utc().format('YYYY-MM-DD HH:mm:ss') as any
      }
      if (!setting.onOff && setting.type === LinkStatus.Started) {
        item.status = LinkStatus.Pending
        item.createdAt = dayjs.utc().format('YYYY-MM-DD HH:mm:ss') as any
      }

      if (setting.delay) {
        item.delayTime = setting.delay
      }

      return item
    })

    return this.repo.save(newLinks)
  }

  async getTotalLinkUserByStatus(userId: number, status: LinkStatus, hideCmt: boolean) {
    const count = await this.connection
      .getRepository(LinkEntity)
      .countBy({
        userId,
        status,
        hideCmt
      })

    return count
  }

  async getTotalLinkUserWhenUpdateMultipleLink(userId: number, status: LinkStatus, hideCmt: boolean, linkIds: number[]) {
    const a = await this.getTotalLinkUserByStatus(userId, status, hideCmt)
    const b = await this.connection
      .getRepository(LinkEntity)
      .countBy({
        userId,
        status: status === LinkStatus.Pending ? LinkStatus.Started : LinkStatus.Pending,
        hideCmt,
        id: In(linkIds)
      })

    return a + b
  }

  async getTotalLinkUser(userId: number) {
    const response = await this.connection.query(`
        SELECT
          (SELECT COUNT(*) FROM links l WHERE l.user_id = u.id AND l.status = 'started') AS totalLinkOn,
          (SELECT COUNT(*) FROM links l WHERE l.user_id = u.id AND l.status = 'pending') AS totalLinkOff
          FROM users u
          WHERE u.id = ${userId};
      `)
    return response[0]
  }

  getPostStarted(): Promise<LinkEntity[]> {
    return this.repo.find({
      where: {
        status: In([LinkStatus.Started, LinkStatus.Pending]),
        type: Not(LinkType.DIE),
        delayTime: MoreThanOrEqual(0),
        hideCmt: false,
        priority: false
      },
      relations: {
        user: true
      }
    })
  }

  priority(body: { priority: boolean, linkId: number }) {
    return this.repo.save({ id: body.linkId, priority: body.priority })
  }
}
