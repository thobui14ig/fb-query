import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { UserEntity } from './modules/user/entities/user.entity';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './modules/auth/auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { LinkModule } from './modules/links/links.module';
import { LinkEntity } from './modules/links/entities/links.entity';
import { CommentsModule } from './modules/comments/comments.module';
import { CommentEntity } from './modules/comments/entities/comment.entity';
import { CookieModule } from './modules/cookie/cookie.module';
import { TokenModule } from './modules/token/token.module';
import { ProxyModule } from './modules/proxy/proxy.module';
import { ProxyEntity } from './modules/proxy/entities/proxy.entity';
import { CookieEntity } from './modules/cookie/entities/cookie.entity';
import { TokenEntity } from './modules/token/entities/token.entity';
import { SettingModule } from './modules/setting/setting.module';
import { KeywordEntity } from './modules/setting/entities/keyword';
import { DelayEntity } from './modules/setting/entities/delay.entity';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { ServeStaticModule } from '@nestjs/serve-static';
import { FacebookModule } from './modules/facebook/facebook.module';
import { MonitoringModule } from './modules/monitoring/monitoring.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'frontend'),
      exclude: ['/^\/api/'], // Đây là cách chắc chắn đúng
    }),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): TypeOrmModuleOptions => ({
        type: configService.get<string>('DB_TYPE') as any,
        host: configService.get<string>('DB_HOST'),
        port: parseInt(configService.get<string>('DB_PORT', '3306'), 10),
        username: configService.get<string>('DB_USER_NAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_DATABASE'),
        entities: [
          UserEntity,
          LinkEntity,
          CommentEntity,
          ProxyEntity,
          CookieEntity,
          TokenEntity,
          KeywordEntity,
          DelayEntity,
        ],
        logging: true,
        // synchronize: true, // chỉ dùng trong dev!
      }),
    }),
    JwtModule.register({
      secret: 'reset',
    }),
    AuthModule,
    LinkModule,
    CommentsModule,
    CookieModule,
    TokenModule,
    ProxyModule,
    SettingModule,
    FacebookModule,
    MonitoringModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    AppService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
