import { Module } from '@nestjs/common';
import { TokenService } from './token.service';
import { TokenController } from './token.controller';
import { TokenEntity } from './entities/token.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([TokenEntity])],
  controllers: [TokenController],
  providers: [TokenService],
})
export class TokenModule { }
