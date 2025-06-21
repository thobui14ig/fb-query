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

  async findByEmail(username: string) {
    const res = await this.connection.query(`
            SELECT
            u.id,
            u.username,
            u.password,
            u.created_at as createdAt,
            u.expired_at as expiredAt,
            u.link_on_limit as linkOnLimit,
            u.link_off_limit as linkOffLimit,
            u.level,
            (SELECT COUNT(*) FROM links l WHERE l.user_id = u.id AND l.type = 'public') AS totalPublic,
            (SELECT COUNT(*) FROM links l1 WHERE l1.user_id = u.id AND l1.type = 'private') AS totalPrivate,
            (SELECT COUNT(*) FROM links l2 WHERE l2.user_id = u.id AND l2.type = 'public' AND l2.status = 'started') AS totalPublicRunning,
            (SELECT COUNT(*) FROM links l3 WHERE l3.user_id = u.id AND l3.type = 'private' AND l3.status = 'started') AS totalPrivateRunning
        FROM users u
        WHERE u.username = '${username}';
      `)
    if (res && res.length > 0) {
      const user = res[0]
      user.createdAt = dayjs(user.createdAt).utc().format('YYYY-MM-DD');
      user.expiredAt = user.expiredAt ? dayjs(user.expiredAt).format('YYYY-MM-DD') : null
      user.password = user.password

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
          u.id,
          u.username,
          u.created_at as createdAt,
          u.expired_at as expiredAt,
          u.link_on_limit as linkOnLimit,
          u.link_off_limit as linkOffLimit,
          u.level,

          (SELECT COUNT(*) FROM links l2 WHERE l2.user_id = u.id AND l2.status = 'started' AND l2.hide_cmt = FALSE) AS totalRunning,
          (SELECT COUNT(*) FROM links l3 WHERE l3.user_id = u.id AND l3.status = 'pending' AND l3.hide_cmt = FALSE) AS totalPending,
          (SELECT COUNT(*) FROM links l4 WHERE l4.user_id = u.id AND l4.status = 'started' AND l4.hide_cmt = TRUE) AS totalLinkHideRunning,
		  (SELECT COUNT(*) FROM links l5 WHERE l5.user_id = u.id AND l5.status = 'pending' AND l5.hide_cmt = TRUE) AS totalLinkHidePending
      FROM users u
      ORDER BY u.id DESC;
      `)
    return res.map((item) => {
      return {
        ...item,
        expiredAt: dayjs(item.expiredAt).format('YYYY-MM-DD'),
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
        u.id,
        u.username,
        u.created_at as createdAt,
        u.expired_at as expiredAt,
        u.link_on_limit as linkOnLimit,
        u.link_off_limit as linkOffLimit,
        u.level,

        (SELECT COUNT(*) FROM links l WHERE l.user_id = u.id AND l.type = 'public') AS totalPublic,

        (SELECT COUNT(*) FROM links l WHERE l.user_id = u.id AND l.type = 'private') AS totalPrivate,

        (SELECT COUNT(*) FROM links l WHERE l.user_id = u.id AND l.type = 'public' AND l.status = 'started') AS totalPublicRunning,

        (SELECT COUNT(*) FROM links l WHERE l.user_id = u.id AND l.type = 'private' AND l.status = 'started') AS totalPrivateRunning

    FROM users u
    WHERE u.id = ${userId};

    `)
    const user = res[0]
    user.createdAt = dayjs(user.createdAt).format('YYYY-MM-DD');
    user.expiredAt = dayjs(user.expiredAt).format('YYYY-MM-DD');

    return user
  }
}
