import { Injectable } from '@nestjs/common';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommentEntity } from './entities/comment.entity';
import { LEVEL, UserEntity } from '../user/entities/user.entity';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(CommentEntity)
    private repo: Repository<CommentEntity>,
  ) { }

  create(createCommentDto: CreateCommentDto) {
    return 'This action adds a new comment';
  }

  findAll(user: UserEntity) {
    if (user.level === LEVEL.ADMIN) {
      return this.repo.find({
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
        order: {
          id: "DESC"
        }
      })
    }

    return this.repo.find({
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
        }
      }
    })
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
