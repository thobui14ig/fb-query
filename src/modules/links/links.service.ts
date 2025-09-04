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

  async getAll(status: LinkStatus, body: BodyLinkQuery, level: LEVEL, userIdByUerLogin: number, isFilter: boolean, hideCmt: boolean, limit: number, offset: number) {
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

    const query = `
      WITH filtered_links AS (
          SELECT
              l.id,
              l.error_message AS errorMessage,
              l.link_name AS linkName,
              l.link_url AS linkUrl,
              l.like,
              l.post_id AS postId,
              l.delay_time AS delayTime,
              l.status,
              DATE_FORMAT(CONVERT_TZ(l.created_at, '+00:00', '+07:00'), '%Y-%m-%d %H:%i:%s') AS createdAt,
              CASE
                  WHEN l.last_comment_time IS NOT NULL
                      THEN TIMESTAMPDIFF(HOUR, l.last_comment_time, UTC_TIMESTAMP())
                  ELSE 9999
              END AS lastCommentTime,
              u.username,
              l.count_before AS countBefore,
              l.count_after AS countAfter,
              l.like_before AS likeBefore,
              l.like_after AS likeAfter,
              l.hide_cmt AS hideCmt,
              l.hide_by AS hideBy,
              l.type,
              CASE
                  WHEN l.time_craw_update IS NOT NULL
                      THEN TIMESTAMPDIFF(HOUR, l.time_craw_update, l.last_comment_time)
                  ELSE 9999
              END AS timeCrawUpdate,
              l.comment_count AS totalComment,
              l.priority,
              IFNULL(c1.totalCommentNewest, 0) AS totalCommentNewest,
              IFNULL(c2.totalCommentToday, 0) AS totalCommentToday,
              (l.count_after - (IFNULL(c1.totalCommentNewest, 0) - l.comment_count)) AS diffTimeCondition
          FROM links l
          JOIN users u ON u.id = l.user_id
          LEFT JOIN (
              SELECT link_id, COUNT(*) AS totalCommentNewest
              FROM comments
              GROUP BY link_id
          ) c1 ON c1.link_id = l.id
          LEFT JOIN (
              SELECT link_id, COUNT(*) AS totalCommentToday
              FROM comments
              WHERE time_created BETWEEN
                  UTC_TIMESTAMP() - INTERVAL (HOUR(UTC_TIMESTAMP())+MINUTE(UTC_TIMESTAMP())/60+SECOND(UTC_TIMESTAMP())/3600) HOUR
                  AND UTC_TIMESTAMP()
              GROUP BY link_id
          ) c2 ON c2.link_id = l.id
          WHERE ${queryEntends}
            /* Filter lastCommentTime */
            ${(!isNullOrUndefined(lastCommentFrom) && !isNullOrUndefined(lastCommentTo))
        ? `AND (CASE WHEN l.last_comment_time IS NOT NULL 
                          THEN TIMESTAMPDIFF(HOUR, l.last_comment_time, UTC_TIMESTAMP()) 
                          ELSE 9999 END) BETWEEN ${lastCommentFrom} AND ${lastCommentTo}`
        : ''}
            /* Filter totalCommentToday */
            ${(!isNullOrUndefined(totalCmtTodayFrom) && !isNullOrUndefined(totalCmtTodayTo))
        ? `AND IFNULL(c2.totalCommentToday, 0) BETWEEN ${totalCmtTodayFrom} AND ${totalCmtTodayTo}`
        : ''}
            /* Filter diffTimeCondition */
            ${(!isNullOrUndefined(diffTimeFrom) && !isNullOrUndefined(diffTimeTo))
        ? `AND (l.count_after - (IFNULL(c1.totalCommentNewest, 0) - l.comment_count)) 
                  BETWEEN ${diffTimeFrom} AND ${diffTimeTo}`
        : ''}
      )
      SELECT *, (SELECT COUNT(*) FROM filtered_links) AS totalCount
      FROM filtered_links
      ORDER BY createdAt DESC
      LIMIT ${limit} OFFSET ${offset};

      `
    let response: any[] = await this.connection.query(query, [])

    return {
      data: response,
      totalCount: response.length > 0 ? response[0].totalCount : 0
    }
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
