import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CreateTokenDto } from './dto/create-token.dto';
import { UpdateTokenDto } from './dto/update-token.dto';
import { TokenEntity } from './entities/token.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { FacebookService } from '../facebook/facebook.service';

@Injectable()
export class TokenService {
  constructor(
    @InjectRepository(TokenEntity)
    private repo: Repository<TokenEntity>,
    private facebookService: FacebookService,
  ) {}

  async create(params: CreateTokenDto) {
    //chưa code trường hợp có cookie
    const tokenValid = [];
    const tokenInValid = [];

    for (const item of params.tokens) {
      let token = item;

      if (item.includes('c_user')) {
        const profile = await this.facebookService.getDataProfileFb(token);

        if (!profile.accessToken) {
          tokenInValid.push(token);
          continue;
        }
        token = profile.accessToken;
      }

      const isExit = (await this.repo.findOne({
        where: {
          tokenValue: token,
        },
      }))
        ? true
        : false;

      if (!isExit) {
        tokenValid.push({
          tokenValue: token,
        });
        continue;
      }

      tokenInValid.push(token);
    }

    await this.repo.save(tokenValid);

    throw new HttpException(
      `Thêm thành công ${tokenValid.length}${tokenInValid.length > 0 ? `, Token không hợp lệ ${tokenInValid.length}: [${tokenInValid.join(',')}]` : ''}`,
      HttpStatus.OK,
    );
  }

  findAll() {
    return this.repo.find({
      order: {
        id: 'desc',
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

  update(id: number, updateTokenDto: UpdateTokenDto) {
    return `This action updates a #${id} token`;
  }

  remove(id: number) {
    return this.repo.delete(id);
  }

  getToken(token: string) {}
}
