import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UserEntity } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private repo: Repository<UserEntity>,
    private connection: DataSource,
  ) { }

  async findByEmail(email: string) {
    return this.repo.findOne({
      where: {
        email,
      },
    });
  }

  create(user: CreateUserDto) {
    return this.repo.save(user);
  }

  findById(id: number) {
    return this.repo.findOne({
      where: {
        id,
      },
    });
  }

  getAll() {
    return this.repo.find({
      select: {
        id: true,
        email: true,
        linkAddLimit: true,
        linkStartLimit: true,
        level: true,
        expiredAt: true
      },

    })
  }

  delete(id: number) {
    return this.repo.delete(id);
  }

  update(user: UpdateUserDto) {
    return this.repo.save(user);
  }
}
