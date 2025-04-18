import { Injectable } from '@nestjs/common';
import { CreateProxyDto } from './dto/create-proxy.dto';
import { UpdateProxyDto } from './dto/update-proxy.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProxyEntity } from './entities/proxy.entity';

@Injectable()
export class ProxyService {
  constructor(
    @InjectRepository(ProxyEntity)
    private repo: Repository<ProxyEntity>,
  ) { }

  create(createProxyDto: CreateProxyDto) {
    return 'This action adds a new proxy';
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

  update(id: number, updateProxyDto: UpdateProxyDto) {
    return `This action updates a #${id} proxy`;
  }

  remove(id: number) {
    return `This action removes a #${id} proxy`;
  }
}
