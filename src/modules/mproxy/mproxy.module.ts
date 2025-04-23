import { Module } from "@nestjs/common";
import { MproxyService } from "./mproxy.service";
import { HttpModule } from "@nestjs/axios";

@Module({
    imports: [HttpModule],
    controllers: [],
    providers: [MproxyService],
    exports: [MproxyService],
})
export class MproxyModule { }
