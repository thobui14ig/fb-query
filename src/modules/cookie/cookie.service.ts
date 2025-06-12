import { Injectable } from '@nestjs/common';
import { CreateCookieDto } from './dto/create-cookie.dto';
import { UpdateCookieDto } from './dto/update-cookie.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CookieEntity, CookieStatus } from './entities/cookie.entity';
import { LEVEL } from '../user/entities/user.entity';
import { FacebookService } from '../facebook/facebook.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class CookieService {
  constructor(
    @InjectRepository(CookieEntity)
    private repo: Repository<CookieEntity>,
    private eventEmitter: EventEmitter2
  ) { }

  async create(params: CreateCookieDto, userId: number, level: LEVEL) {
    const cookies = params.cookies.map((cookie) => {
      return {
        cookie,
        status: CookieStatus.INACTIVE,
        createdBy: userId
      }
    })
    await this.repo.save(cookies)
    if (level === LEVEL.USER) {
      cookies.forEach((cookie) => {
        this.eventEmitter.emit(
          'gen-token-user',
          cookie,
        );
      })
    }
  }

  findAll(level: LEVEL, userId: number) {
    if (level === LEVEL.USER) {
      return this.repo.find({
        where: {
          createdBy: userId
        },
        order: {
          id: "DESC"
        }
      })
    }
    return this.repo.find({
      order: {
        id: "DESC"
      },
      relations: {
        user: true
      },
      where: {
        user: {
          level: 1
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

  update(id: number, updateCookieDto: UpdateCookieDto) {
    return this.repo.save({ ...updateCookieDto, id })
  }

  remove(id: number) {
    return this.repo.delete(id);
  }
}
