import { Module } from "@nestjs/common";
import { VpsController } from "./vps.controller";
import { VpsService } from "./vps.service";
import { HttpModule } from "@nestjs/axios";
import { TypeOrmModule } from "@nestjs/typeorm";
import { VpsEntity } from "./entities/vps.entity";

@Module({
    imports: [HttpModule, TypeOrmModule.forFeature([VpsEntity])],
    controllers: [VpsController],
    providers: [VpsService],
    exports: [VpsService],
})
export class VpsModule { }
