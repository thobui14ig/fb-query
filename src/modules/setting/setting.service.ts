import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateKeywordDto } from './dto/create-keyword.dto';
import { KeywordEntity } from './entities/keyword';
import { CreateDelayDTO } from './dto/create-delay.dto';
import { DelayEntity } from './entities/delay.entity';

@Injectable()
export class SettingService {
  constructor(
    @InjectRepository(KeywordEntity)
    private keywordRepository: Repository<KeywordEntity>,
    @InjectRepository(DelayEntity)
    private delayRepository: Repository<DelayEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) { }

  async createKeywordLink(params: CreateKeywordDto, userId: number) {
    return await this.dataSource.transaction(async (manager) => {
      await manager.delete(KeywordEntity, { linkId: params.linkId });

      const delayEntities: Partial<KeywordEntity>[] = params.keywords.map((keyword) => ({
        keyword,
        userId,
        linkId: params.linkId
      }));

      return await manager.insert(KeywordEntity, delayEntities);
    });

  }

  async createKeyword(params: CreateKeywordDto, userId: number) {
    return await this.dataSource.transaction(async (manager) => {
      await manager.delete(KeywordEntity, { userId });

      const delayEntities: Partial<KeywordEntity>[] = params.keywords.map((keyword) => ({
        keyword,
        userId,
      }));

      return await manager.insert(KeywordEntity, delayEntities);
    });

  }

  async createDelay(param: CreateDelayDTO) {
    const delayFromDb = await this.delayRepository.find()
    const updatedAt = new Date().toUTCString()
    let currentDelayEntity = delayFromDb.length === 0 ? { ...param, updatedAt } : { ...delayFromDb[0], ...param, updatedAt }

    return this.delayRepository.save(currentDelayEntity)
  }

  getKeywords(userId: number) {
    return this.keywordRepository.find({
      where: {
        userId
      }
    })
  }

  async getDelay() {
    const response = await this.delayRepository.find()
    return (response.length === 0 ? null : response[0])
  }

  removeAllKeyword() {
    return this.keywordRepository.delete({})
  }
}
