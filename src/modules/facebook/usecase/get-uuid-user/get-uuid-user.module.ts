import { HttpModule } from "@nestjs/axios";
import { forwardRef, Module } from "@nestjs/common";
import { ProxyModule } from "src/modules/proxy/proxy.module";
import { GetUuidUserUseCase } from "./get-uuid-user";
import { TokenModule } from "src/modules/token/token.module";

@Module({
    imports: [HttpModule, ProxyModule, TokenModule],
    controllers: [],
    providers: [GetUuidUserUseCase],
    exports: [GetUuidUserUseCase],
})
export class GetUuidUserUseCaseModule { }
