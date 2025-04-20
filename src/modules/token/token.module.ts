import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacebookModule } from '../facebook/facebook.module';
import { TokenEntity } from './entities/token.entity';
import { TokenController } from './token.controller';
import { TokenService } from './token.service';

@Module({
  imports: [TypeOrmModule.forFeature([TokenEntity]), FacebookModule],
  controllers: [TokenController],
  providers: [TokenService],
})
export class TokenModule { }
