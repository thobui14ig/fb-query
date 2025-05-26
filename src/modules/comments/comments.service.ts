import { Injectable } from '@nestjs/common';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { CommentEntity } from './entities/comment.entity';
import { LEVEL, UserEntity } from '../user/entities/user.entity';
import * as dayjs from 'dayjs';
import * as timezone from 'dayjs/plugin/timezone';
import * as utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class CommentsService {
  vnTimezone = 'Asia/Bangkok';
  constructor(
    @InjectRepository(CommentEntity)
    private repo: Repository<CommentEntity>,
  ) { }

  create(createCommentDto: CreateCommentDto) {
    return 'This action adds a new comment';
  }

  async findAll(user: UserEntity) {
    const startDate = dayjs.utc()
      .format('YYYY-MM-DD 00:00:00')
    const endDate = dayjs.utc()
      .format('YYYY-MM-DD 23:59:59')

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
          user: {
            email: true
          },
          link: {
            linkName: true,
            linkUrl: true
          }
        },
        order: {
          timeCreated: "DESC"
        },
        where: {
          timeCreated: Between(startDate, endDate) as any
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
          user: {
            email: true
          },
          link: {
            linkName: true
          }
        },
        where: {
          userId: user.id,
          link: {
            userId: user.id,
          },
          timeCreated: Between(startDate, endDate) as any
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
}
