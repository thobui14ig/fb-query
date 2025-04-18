import { Injectable } from '@nestjs/common';
import { CreateCookieDto } from './dto/create-cookie.dto';
import { UpdateCookieDto } from './dto/update-cookie.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CookieEntity } from './entities/cookie.entity';

@Injectable()
export class CookieService {
  constructor(
    @InjectRepository(CookieEntity)
    private repo: Repository<CookieEntity>,
  ) { }

  create(createCookieDto: CreateCookieDto) {
    return 'This action adds a new cookie';
  }

  findAll() {
    return this.repo.find()
  }

  findOne(id: number) {
    return this.repo.findOne({
      where: {
        id
      }
    })
  }

  update(id: number, updateCookieDto: UpdateCookieDto) {
    return `This action updates a #${id} cookie`;
  }

  remove(id: number) {
    return `This action removes a #${id} cookie`;
  }
}
