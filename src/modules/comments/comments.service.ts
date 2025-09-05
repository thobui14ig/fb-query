import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as dayjs from 'dayjs';
import * as timezone from 'dayjs/plugin/timezone';
import * as utc from 'dayjs/plugin/utc';
import { Between, DataSource, Repository } from 'typeorm';
import { LEVEL, UserEntity } from '../user/entities/user.entity';
import { IGetCommentParams } from './comments.service.i';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentEntity } from './entities/comment.entity';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';

dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class CommentsService {
  vnTimezone = 'Asia/Bangkok';
  constructor(
    @InjectRepository(CommentEntity)
    private repo: Repository<CommentEntity>,
    private readonly httpService: HttpService,
    private readonly connection: DataSource,
  ) { }
  async findAll(user: UserEntity, hideCmt: boolean, params: IGetCommentParams) {
    const vnNowStart = dayjs(params.startDate).tz(this.vnTimezone)
    const vnNowEnd = dayjs(params.endDate).tz(this.vnTimezone)
    const startDate = vnNowStart.startOf('day').utc().format('YYYY-MM-DD HH:mm:ss');
    const endDate = vnNowEnd.endOf('day').utc().format('YYYY-MM-DD HH:mm:ss');
    const keyword = params.keyword.length > 0 ? params.keyword.trim() : null

    let response = []
    const limit = params.limit
    const offset = params.offset

    const condition = user.level as LEVEL === LEVEL.ADMIN ? `` : `c.user_id = ${user.id} AND `
    const query = `
      SELECT 
          c.id,
          c.post_id       AS postId,
          c.user_id       AS userId,
          c.uid,
          c.name,
          c.message,
          c.time_created  AS timeCreated,
          c.phone_number  AS phoneNumber,
          c.cmtid        AS cmtId,
          c.link_id       AS linkId,
          c.hide_cmt      AS hideCmt,
          JSON_OBJECT(
              'id', u.id,
              'username', u.username,
              'getPhone', u.get_phone
          ) AS user,
          JSON_OBJECT(
              'id', l.id,
              'linkName', l.link_name,
              'linkUrl', l.link_url,
              'hideCmt', l.hide_cmt
          ) AS link,
          COUNT(*) OVER() AS totalCount
      FROM comments c
      JOIN users u 
          ON u.id = c.user_id
      JOIN links l 
          ON l.id = c.link_id
      WHERE 
        ${condition}
          l.hide_cmt = ${hideCmt}
          AND c.time_created BETWEEN '${startDate}' AND '${endDate}'
          ${keyword ? `AND (
            c.message REGEXP '${keyword}' 
            OR u.username REGEXP '${keyword}'
            OR c.post_id REGEXP '${keyword}'
            OR c.uid REGEXP '${keyword}'
            OR c.name REGEXP '${keyword}'
            OR c.phone_number REGEXP '${keyword}'
          )` : ""}
      ORDER BY c.time_created DESC
      LIMIT ${limit} OFFSET ${offset};
    `
    response = await this.connection.query(query)

    const res = response.length > 0 ? response.map((item) => {
      const utcTime = dayjs(item.timeCreated).format('YYYY-MM-DD HH:mm:ss')

      return {
        ...item,
        timeCreated: dayjs.utc(utcTime).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss')
      }
    }) : []
    return {
      data: res,
      totalCount: response.length > 0 ? response[0].totalCount : 0,
    }
  }

  findOne(id: number) {
    return this.repo.findOne({
      where: {
        id
      }
    })
  }

  update(id: number, updateCommentDto: UpdateCommentDto) {
    return `This action updates a #${id} comment`;
  }

  remove(id: number) {
    return this.repo.delete(id)
  }

  async hideCmt(comment: CommentEntity) {
    await lastValueFrom(this.httpService.post("http://160.25.232.64:7000/facebook/hide-cmt", comment))
    return true
  }
}
