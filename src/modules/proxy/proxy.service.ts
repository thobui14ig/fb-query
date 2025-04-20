import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
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

  async create(params: CreateProxyDto) {
    const proxiesValid = []
    const proxiesInValid = []

    for (const proxy of params.proxies) {
      const isExit = await this.repo.findOne({
        where: {
          proxyAddress: proxy
        }
      }) ? true : false

      if (!isExit) {
        proxiesValid.push({
          proxyAddress: proxy
        })
        continue
      }

      proxiesInValid.push(proxy)
    }
    await this.repo.save(proxiesValid)

    if (proxiesInValid.length > 0) {
      throw new HttpException(`Thêm thành công ${proxiesValid.length}, Proxy bị trùng: [${proxiesInValid.join(',')}]`, HttpStatus.BAD_REQUEST);
    }
    throw new HttpException(`Thêm thành công ${proxiesValid.length} proxy`, HttpStatus.OK);
  }

  findAll() {
    return this.repo.find({
      order: {
        id: 'DESC'
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

  update(id: number, updateProxyDto: UpdateProxyDto) {
    return `This action updates a #${id} proxy`;
  }

  remove(id: number) {
    return this.repo.delete(id);
  }
}
