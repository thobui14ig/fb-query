import { HttpModule } from "@nestjs/axios";
import { forwardRef, Module } from "@nestjs/common";
import { TokenModule } from "src/modules/token/token.module";
import { ProxyModule } from "src/modules/proxy/proxy.module";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LinkEntity } from "src/modules/links/entities/links.entity";
import { GetCommentPrivateUseCase } from "./get-comment-private";

@Module({
    imports: [HttpModule, forwardRef(() => TokenModule), ProxyModule, TypeOrmModule.forFeature([LinkEntity])],
    controllers: [],
    providers: [GetCommentPrivateUseCase],
    exports: [GetCommentPrivateUseCase],
})
export class GetCommentPrivateUseCaseModule { }
