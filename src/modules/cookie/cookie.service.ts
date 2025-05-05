import { Injectable } from '@nestjs/common';
import { CreateCookieDto } from './dto/create-cookie.dto';
import { UpdateCookieDto } from './dto/update-cookie.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CookieEntity, CookieStatus } from './entities/cookie.entity';

@Injectable()
export class CookieService {
  constructor(
    @InjectRepository(CookieEntity)
    private repo: Repository<CookieEntity>,
  ) { }

  create(params: CreateCookieDto) {
    const cookies = params.cookies.map((cookie) => {
      return {
        cookie,
        status: CookieStatus.INACTIVE
      }
    })
    return this.repo.save(cookies)
  }

  findAll() {
    return this.repo.find({
      order: {
        id: "DESC"
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
