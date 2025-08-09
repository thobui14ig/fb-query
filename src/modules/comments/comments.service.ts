import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as dayjs from 'dayjs';
import * as timezone from 'dayjs/plugin/timezone';
import * as utc from 'dayjs/plugin/utc';
import { Between, Repository } from 'typeorm';
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
  ) { }
  async findAll(user: UserEntity, hideCmt: boolean, params: IGetCommentParams) {
    const vnNowStart = dayjs(params.startDate).tz(this.vnTimezone)
    const vnNowEnd = dayjs(params.endDate).tz(this.vnTimezone)
    const startDate = vnNowStart.startOf('day').utc().format('YYYY-MM-DD HH:mm:ss');
    const endDate = vnNowEnd.endOf('day').utc().format('YYYY-MM-DD HH:mm:ss');

    let response: CommentEntity[] = []
    if (user.level === LEVEL.ADMIN) {
      response = await this.repo.find({
        relations: {
          user: true,
          link: true
        },
        select: {
          id: true,
          postId: true,
          userId: true,
          uid: true,
          name: true,
          message: true,
          timeCreated: true,
          phoneNumber: true,
          cmtId: true,
          linkId: true,
          hideCmt: true,
          user: {
            username: true,
          },
          link: {
            id: true,
            linkName: true,
            linkUrl: true,
          }
        },
        order: {
          timeCreated: "DESC"
        },
        where: {
          timeCreated: Between(startDate, endDate) as any,
          link: {
            hideCmt
          }
        }
      })
    } else {
      response = await this.repo.find({
        relations: {
          user: true,
          link: true
        },
        select: {
          id: true,
          postId: true,
          userId: true,
          uid: true,
          name: true,
          message: true,
          timeCreated: true,
          phoneNumber: true,
          cmtId: true,
          linkId: true,
          hideCmt: true,
          user: {
            username: true,
            getPhone: true
          },
          link: {
            id: true,
            linkName: true,
            linkUrl: true,
            hideCmt: true
          }
        },
        where: {
          userId: user.id,
          link: {
            userId: user.id,
            hideCmt
          },
          timeCreated: Between(startDate, endDate) as any,

        },
        order: {
          timeCreated: "DESC"
        }
      })
    }

    const res = response.map((item) => {
      const utcTime = dayjs(item.timeCreated).format('YYYY-MM-DD HH:mm:ss')

      return {
        ...item,
        timeCreated: dayjs.utc(utcTime).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss')
      }
    })
    return res
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
    console.log("🚀 ~ CommentsService ~ hideCmt ~ comment:", comment)
    await lastValueFrom(this.httpService.post("http://160.25.232.64:7000/facebook/hide-cmt", comment))
    return true
  }
}
