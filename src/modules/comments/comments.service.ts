import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { CommentEntity } from './entities/comment.entity';
import { LEVEL, UserEntity } from '../user/entities/user.entity';
import * as dayjs from 'dayjs';
import * as timezone from 'dayjs/plugin/timezone';
import * as utc from 'dayjs/plugin/utc';
import { CookieEntity } from '../cookie/entities/cookie.entity';
import { FacebookService } from '../facebook/facebook.service';

dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class CommentsService {
  vnTimezone = 'Asia/Bangkok';
  constructor(
    @InjectRepository(CommentEntity)
    private repo: Repository<CommentEntity>,
    @InjectRepository(CookieEntity)
    private cookieRepository: Repository<CookieEntity>,
    private facebookService: FacebookService
  ) { }

  create(createCommentDto: CreateCommentDto) {
    return 'This action adds a new comment';
  }

  async findAll(user: UserEntity, hideCmt: boolean) {
    const vnNow = dayjs().tz(this.vnTimezone); // thời gian hiện tại theo giờ VN
    const startDate = vnNow.startOf('day').utc().format('YYYY-MM-DD HH:mm:ss');
    const endDate = vnNow.endOf('day').utc().format('YYYY-MM-DD HH:mm:ss');

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
            email: true
          },
          link: {
            linkName: true,
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

  async hideCmt(cmtId: string, userId: number) {
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

    const res = await this.facebookService.hideCmt(cmtId, cookie)
    if (res?.errors?.length > 0 && res?.errors[0].code === 1446036) {
      throw new HttpException(
        `Comment đã được ẩn.`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const cmt = await this.repo.findOne({
      where: {
        cmtId
      }
    })

    if (cmt) {
      return this.repo.save({ ...cmt, hideCmt: true })
    }
  }
}
