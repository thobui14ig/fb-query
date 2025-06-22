import { forwardRef, Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { UserEntity } from './entities/user.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LinkModule } from '../links/links.module';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity]), forwardRef(() => LinkModule)],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule { }
