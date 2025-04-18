import { Request } from 'express';
import { UserEntity } from 'src/modules/user/entities/user.entity';

export const getUser = (req: Request): UserEntity => {
  return req['user'];
};
