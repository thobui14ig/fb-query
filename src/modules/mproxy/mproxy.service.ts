import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { firstValueFrom } from "rxjs";

@Injectable()
export class MproxyService {
    constructor(private readonly httpService: HttpService) { }

    @Cron(CronExpression.EVERY_MINUTE)
    resetIp() {
        return firstValueFrom(
            this.httpService.get('https://mproxy.vn/capi/aivWFJoEwl-QzpyXTKvU6EqereRh5rZ0JbV2qsQCeoY/key/LOKeNCbTGeI1t/resetIp'),
        ).then(() => {
            console.log("--Reset ip success--")
        }).catch(() => {
            console.log("--Reset ip Error--")
        })
    }
}