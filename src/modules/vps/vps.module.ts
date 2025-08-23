import { Module } from "@nestjs/common";
import { VpsController } from "./vps.controller";
import { VpsService } from "./vps.service";
import { HttpModule } from "@nestjs/axios";

@Module({
    imports: [HttpModule],
    controllers: [VpsController],
    providers: [VpsService],
    exports: [VpsService],
})
export class VpsModule { }
