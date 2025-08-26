import { Module } from '@nestjs/common';
import { AppGateway } from './app.gateway';

@Module({
    imports: [],
    providers: [AppGateway],
    controllers: [],
    exports: [AppGateway],
})
export class GatewayModules { }