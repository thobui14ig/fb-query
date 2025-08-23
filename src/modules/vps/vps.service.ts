import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import { firstValueFrom } from "rxjs";

@Injectable()
export class VpsService {
    constructor(private readonly httpService: HttpService,) { }

    async getAll() {
        const vpsLive = [{
            id: 1,
            ip: "160.25.232.64",
            port: 7000,
            status: false
        },
        {
            id: 2,
            ip: "160.25.232.64",
            port: 7001,
            status: false
        },
        {
            id: 3,
            ip: "160.25.232.64",
            port: 7002,
            status: false
        }
        ]
        for (const vps of vpsLive) {
            try {
                const data = await firstValueFrom(this.httpService.get(`http://${vps.ip}:${vps.port}/health-check`))
                vps.status = data.data
            } catch (e) { }
        }

        return vpsLive
    }
}