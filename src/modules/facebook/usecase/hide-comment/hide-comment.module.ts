import { HttpModule } from "@nestjs/axios";
import { forwardRef, Module } from "@nestjs/common";
import { ProxyModule } from "src/modules/proxy/proxy.module";
import { TokenModule } from "src/modules/token/token.module";
import { HideCommentUseCase } from "./hide-comment";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CommentEntity } from "src/modules/comments/entities/comment.entity";
import { CookieEntity } from "src/modules/cookie/entities/cookie.entity";
import { KeywordEntity } from "src/modules/setting/entities/keyword";

@Module({
    imports: [HttpModule, ProxyModule, TokenModule, TypeOrmModule.forFeature([CommentEntity, CookieEntity])],
    controllers: [],
    providers: [HideCommentUseCase],
    exports: [HideCommentUseCase],
})
export class HideCommentUseCaseModule { }
