import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CreateProxyDto } from './dto/create-proxy.dto';
import { UpdateProxyDto } from './dto/update-proxy.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProxyEntity, ProxyStatus } from './entities/proxy.entity';

@Injectable()
export class ProxyService {
  constructor(
    @InjectRepository(ProxyEntity)
    private repo: Repository<ProxyEntity>,
    private connection: DataSource,
  ) { }

  async create(params: CreateProxyDto) {
    const proxiesValid = [];
    const proxiesInValid = [];

    for (let proxy of params.proxies) {
      if (proxy.includes('@')) {
        const proxyArr = proxy.split('@')
        proxy = `${proxyArr[1]}:${proxyArr[0]}`
      }
      const isExit = (await this.repo.findOne({
        where: {
          proxyAddress: proxy,
        },
      }))
        ? true
        : false;

      if (!isExit) {
        proxiesValid.push({
          proxyAddress: proxy,
        });
        continue;
      }

      proxiesInValid.push(proxy);
    }
    await this.repo.save(proxiesValid);

    if (proxiesInValid.length > 0) {
      throw new HttpException(
        `Thêm thành công ${proxiesValid.length}, Proxy bị trùng: [${proxiesInValid.join(',')}]`,
        HttpStatus.BAD_REQUEST,
      );
    }
    throw new HttpException(
      `Thêm thành công ${proxiesValid.length} proxy`,
      HttpStatus.OK,
    );
  }

  findAll() {
    return this.repo.find({
      order: {
        id: 'DESC',
      },
    });
  }

  findOne(id: number) {
    return this.repo.findOne({
      where: {
        id,
      },
    });
  }

  update(id: number, updateProxyDto: UpdateProxyDto) {
    return `This action updates a #${id} proxy`;
  }

  remove(id: number) {
    return this.connection.transaction(async (manager) => {
      const record = await manager
        .getRepository(ProxyEntity)
        .createQueryBuilder("e")
        .setLock("pessimistic_write")
        .where("e.id = :id", { id })
        .getOneOrFail();


      await manager.remove(record);
    });
  }

  async getRandomProxy() {
    const proxies = await this.repo.find({
      where: {
        status: ProxyStatus.ACTIVE,
      }
    })
    const randomIndex = Math.floor(Math.random() * proxies.length);
    const randomProxy = proxies[randomIndex];

    return randomProxy
  }

  updateProxyFbBlock(proxy: ProxyEntity) {
    return this.repo.save({ ...proxy, isFbBlock: true })
  }

  updateProxyDie(proxy: ProxyEntity) {
    return this.repo.save({ ...proxy, status: ProxyStatus.IN_ACTIVE })
  }
}
