import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UserEntity } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import * as dayjs from 'dayjs';
import * as timezone from 'dayjs/plugin/timezone';
import * as utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private repo: Repository<UserEntity>,
    private connection: DataSource,
  ) { }

  async findByEmail(email: string) {
    const res = await this.connection.query(`
            SELECT
          u.id
          ,u.email
          ,u.password
          ,u.created_at as createdAt
          ,u.expired_at as expiredAt
          ,u.link_add_limit as linkAddLimit
          ,u.link_start_limit as linkStartLimit
          ,u.level
          ,count(l.id) as totalPublic, count(l1.id)as totalPrivate, count(l2.id) as totalPublicRunning, count(l3.id) as totalPrivateRunning  FROM users  u
          left join links l on l.user_id= u.id and l.type='public'
          left join links l1 on l1.user_id= u.id and l1.type='private'
          left join links l2 on l2.user_id= u.id and l2.type='public' and l2.status='started'
          left join links l3 on l3.user_id= u.id and l3.type='private' and l3.status='started'
          where u.email='${email}'
          group by u.id
      `)
    if (res && res.length > 0) {
      const user = res[0]
      user.createdAt = dayjs(user.createdAt).utc().format('YYYY-MM-DD');
      user.expiredAt = dayjs(user.expiredAt).utc().format('YYYY-MM-DD');

      return user
    }

    return null
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

  async getAll() {
    const res = await this.connection.query(`
        SELECT       
        u.id
        ,u.email
        ,u.created_at as createdAt
        ,u.expired_at as expiredAt
        ,u.link_add_limit as linkAddLimit
        ,u.link_start_limit as linkStartLimit
        ,u.level
      ,count(l2.id) as totalRunning, count(l3.id) as totalPending  FROM users  u
        left join links l2 on l2.user_id= u.id  and l2.status='started'
        left join links l3 on l3.user_id= u.id  and l3.status='pending'
        where u.level = 0
        group by u.id
        order by u.id desc
      `)
    return res.map((item) => {
      return {
        ...item,
        expiredAt: dayjs(item.expiredAt).utc().format('YYYY-MM-DD'),
      }
    })
  }

  delete(id: number) {
    return this.repo.delete(id);
  }

  update(user: UpdateUserDto) {
    return this.repo.save(user);
  }

  async getInfo(userId: number) {
    const res = await this.connection.query(`
      SELECT 
      u.id
      ,u.email
      ,u.created_at as createdAt
      ,u.expired_at as expiredAt
      ,u.link_add_limit as linkAddLimit
      ,u.link_start_limit as linkStartLimit
      ,u.level
      ,count(l.id) as totalPublic, count(l1.id)as totalPrivate, count(l2.id) as totalPublicRunning, count(l3.id) as totalPrivateRunning  FROM users  u
      left join links l on l.user_id= u.id and l.type='public'
      left join links l1 on l1.user_id= u.id and l1.type='private'
      left join links l2 on l2.user_id= u.id and l2.type='public' and l2.status='started'
      left join links l3 on l3.user_id= u.id and l3.type='private' and l3.status='started'
      where u.id=${userId}
      group by u.id
    `)
    const user = res[0]
    user.createdAt = dayjs(user.createdAt).utc().format('YYYY-MM-DD');
    user.expiredAt = dayjs(user.expiredAt).utc().format('YYYY-MM-DD');

    return user
  }
}
