import { HttpException, HttpStatus, Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { CommentEntity } from '../comments/entities/comment.entity';
import { CookieEntity, CookieStatus } from '../cookie/entities/cookie.entity';
import { FacebookService } from '../facebook/facebook.service';
import {
  LinkEntity,
  LinkStatus,
  LinkType
} from '../links/entities/links.entity';
import { ProxyEntity, ProxyStatus } from '../proxy/entities/proxy.entity';
import { DelayEntity } from '../setting/entities/delay.entity';
import { TokenEntity, TokenHandle, TokenStatus } from '../token/entities/token.entity';
import { LEVEL } from '../user/entities/user.entity';
import { ProcessDTO } from './dto/process.dto';
import { GroupedLinksByType } from './monitoring.service.i';
import { isNumber } from 'class-validator';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import { EventEmitter2 } from '@nestjs/event-emitter';
const proxy_check = require('proxy-check');

dayjs.extend(utc);

type RefreshKey = 'refreshToken' | 'refreshCookie' | 'refreshProxy';
@Injectable()
export class MonitoringService implements OnModuleInit {
  postIdRunning: string[] = []
  linksPublic: LinkEntity[] = []
  linksPrivate: LinkEntity[] = []
  isHandleUrl: boolean = false
  isReHandleUrl: boolean = false
  isHandleUuid: boolean = false
  isCheckProxy: boolean = false
  private jobIntervalHandlers: Record<RefreshKey, NodeJS.Timeout> = {
    refreshToken: null,
    refreshCookie: null,
    refreshProxy: null,
  };

  private currentRefreshMs: Record<RefreshKey, number> = {
    refreshToken: 0,
    refreshCookie: 0,
    refreshProxy: 0,
  };

  constructor(
    @InjectRepository(LinkEntity)
    private linkRepository: Repository<LinkEntity>,
    @InjectRepository(CommentEntity)
    private commentRepository: Repository<CommentEntity>,
    private readonly facebookService: FacebookService,
    @InjectRepository(TokenEntity)
    private tokenRepository: Repository<TokenEntity>,
    @InjectRepository(CookieEntity)
    private cookieRepository: Repository<CookieEntity>,
    @InjectRepository(ProxyEntity)
    private proxyRepository: Repository<ProxyEntity>,
    @InjectRepository(DelayEntity)
    private delayRepository: Repository<DelayEntity>,
    private readonly httpService: HttpService,
    private eventEmitter: EventEmitter2
  ) {
  }

  async onModuleInit() {
    // Bắt đầu kiểm tra định kỳ từng loại
    ['refreshToken', 'refreshCookie', 'refreshProxy', 'delayCommentCount'].forEach((key: RefreshKey) => {
      setInterval(() => this.checkAndUpdateScheduler(key), 10 * 1000);
      this.checkAndUpdateScheduler(key); // gọi ngay lúc khởi động
    });
  }

  private async checkAndUpdateScheduler(key: RefreshKey) {
    const config = await this.delayRepository.find();
    if (!config.length) return;
    const newRefreshMs = (config[0][key] ?? 60) * 60 * 1000;

    if (newRefreshMs !== this.currentRefreshMs[key]) {
      this.currentRefreshMs[key] = newRefreshMs;

      if (this.jobIntervalHandlers[key]) {
        clearInterval(this.jobIntervalHandlers[key]);
      }

      this.jobIntervalHandlers[key] = setInterval(() => {
        this.doScheduledJob(key);
      }, newRefreshMs);

      console.log(`🔄 Đặt lại job "${key}" mỗi ${newRefreshMs / 1000}s`);
    }
  }

  private async doScheduledJob(key: RefreshKey) {
    if (key === "refreshToken") {
      return this.updateActiveAllToken()
    }
    if (key === "refreshCookie") {
      return this.updateActiveAllCookie()
    }
    if (key === "refreshProxy") {
      return this.updateActiveAllProxy()
    }
    if (key === "delayCommentCount") {
      return this.startProcessTotalCount()
    }
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async startMonitoring() {
    const postsStarted = await this.getPostStarted()
    const groupPost = this.groupPostsByType(postsStarted || []);

    return Promise.all([this.handleStartMonitoring((groupPost.public || []), LinkType.PUBLIC), this.handleStartMonitoring((groupPost.private || []), LinkType.PRIVATE)])
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async checkProxy() {
    if (this.isCheckProxy) return

    this.isCheckProxy = true
    const proxyInActive = await this.proxyRepository.find()

    for (const proxy of proxyInActive) {
      const [host, port, username, password] = proxy.proxyAddress.split(':');
      const config = {
        host,
        port,
        proxyAuth: `${username}:${password}`
      };
      proxy_check(config).then(async (res) => {
        if (res) {
          const status = await this.facebookService.checkProxyBlock(proxy)
          if (!status) {
            await this.facebookService.updateProxyActive(proxy)
          } else {
            await this.facebookService.updateProxyDie(proxy)
          }
        }
      }).catch(async (e) => {
        await this.facebookService.updateProxyDie(proxy)
      });
    }
    this.isCheckProxy = false
  }

  async startProcessTotalCount() {
    const postsStarted = await this.getPostStarted()
    const groupPost = this.groupPostsByType(postsStarted || []);

    const processLinksPulic = async () => {
      const links = groupPost.public ?? [];
      const batchSize = 10;

      // Hàm xử lý một link
      const processLink = async (link: LinkEntity) => {
        try {
          const res = await this.facebookService.getCountLikePublic(link.linkUrl);
          const totalCount = res?.totalCount;
          const totalLike = res?.totalLike;
          const oldCountCmt = link.countBefore;
          const oldLike = link.likeBefore;


          if (totalCount) {
            link.countBefore = totalCount;
            link.countAfter = totalCount - (oldCountCmt ?? 0);
          }

          if (totalLike) {
            link.likeBefore = totalLike;
            link.likeAfter = totalLike - (oldLike ?? 0);
          }

          await this.linkRepository.save(link);
        } catch (error) {
          console.log("🚀 ~ MonitoringService ~ processLinksPulic ~ error:", error?.message);
        }
      };

      // Chia mảng thành từng batch 10 phần tử và xử lý song song từng batch
      for (let i = 0; i < links.length; i += batchSize) {
        const batch = links.slice(i, i + batchSize);
        await Promise.all(batch.map(link => processLink(link)));
      }
    }

    const processLinksPrivate = async () => {
      const links = groupPost.private ?? [];
      const batchSize = 10;


      const processPrivateLink = async (link: any) => {
        const proxy = await this.getRandomProxy();
        if (!proxy) return;

        try {
          const res = await this.facebookService.getTotalCountWithToken(link);

          if (res?.totalCountCmt && res?.totalCountLike) {
            const oldCountCmt = link.countBefore;
            const oldLike = link.likeBefore;

            link.countBefore = res.totalCountCmt;
            link.countAfter = res.totalCountCmt - (oldCountCmt ?? 0);
            link.likeBefore = res.totalCountLike;
            link.likeAfter = res.totalCountLike - (oldLike ?? 0);

            await this.linkRepository.save(link);
          }
        } catch (error) {
          console.log("🚀 ~ MonitoringService ~ processPrivateLinks ~ error:", error?.message);
        }
      };

      // Chia và xử lý theo batch 10 phần tử một lần
      for (let i = 0; i < links.length; i += batchSize) {
        const batch = links.slice(i, i + batchSize);
        await Promise.all(batch.map(link => processPrivateLink(link)));
      }
    }

    return Promise.all([processLinksPrivate(), processLinksPulic()])
  }

  handleStartMonitoring(links: LinkEntity[], type: LinkType) {
    let oldLinksRunning = []
    if (type === LinkType.PUBLIC) {
      oldLinksRunning = this.linksPublic
    } else {
      oldLinksRunning = this.linksPrivate
    }


    const oldIdsSet = new Set(oldLinksRunning.map(item => item.id));
    const linksRunning = links.filter(item => !oldIdsSet.has(item.id));

    if (type === LinkType.PUBLIC) {
      this.linksPublic = links
      return this.handlePostsPublic(linksRunning)
    } else {
      this.linksPrivate = links
      return this.handlePostsPrivate(linksRunning)
    }
  }

  async processLinkPublic(link: LinkEntity) {
    const currentLink = await this.linkRepository.findOne({
      where: {
        id: link.id
      }
    })
    while (true) {
      const isCheckRuning = this.linksPublic.find(item => item.id === link.id)// check còn nằm trong link
      if (!isCheckRuning) { break };

      try {
        if (!currentLink) break;
        const proxy = await this.facebookService.getRandomProxyGetProfile()
        if (!proxy) continue
        let res = await this.facebookService.getCmtPublic(link.postId, link.postId) || {} as any

        if ((!res.commentId || !res.userIdComment) && link.postIdV1) {
          res = await this.facebookService.getCmtPublic(link.postIdV1, link.postId) || {} as any
        }

        if (!res?.commentId || !res?.userIdComment) continue;
        const links = await this.selectLinkUpdate(link.id)
        const commentEntities: CommentEntity[] = []
        const linkEntities: LinkEntity[] = []
        const {
          commentId,
          commentMessage,
          phoneNumber,
          userIdComment,
          userNameComment,
          commentCreatedAt,
        } = res

        for (const link of links) {
          const commentEntity: Partial<CommentEntity> = {
            cmtId: commentId,
            linkId: link.id,
            postId: link.postId,
            userId: link.userId,
            uid: userIdComment,
            message: commentMessage,
            phoneNumber,
            name: userNameComment,
            timeCreated: commentCreatedAt as any,
          }
          const comment = await this.getComment(link.id, link.userId, commentId)
          if (!comment) {
            commentEntities.push(commentEntity as CommentEntity)
          }
          const linkEntity: LinkEntity = { ...link, lastCommentTime: !link.lastCommentTime || dayjs.utc(commentCreatedAt).isAfter(dayjs.utc(link.lastCommentTime)) ? commentCreatedAt : link.lastCommentTime }
          linkEntities.push(linkEntity)
        }

        const [comments, _] = await Promise.all([this.commentRepository.save(commentEntities), this.linkRepository.save(linkEntities)])
        this.eventEmitter.emit(
          'hide.cmt',
          comments,
        );
      } catch (error) {
        console.log(`Crawl comment with postId ${link.postId} Error.`, error?.message)
      } finally {
        await this.delay((currentLink.delayTime ?? 5) * 1000)
      }

    }
  }

  async handlePostsPublic(linksRunning: LinkEntity[]) {
    const postHandle = linksRunning.map((link) => {
      return this.processLinkPublic(link)
    })

    return Promise.all(postHandle)
  }

  async processLinkPrivate(link: LinkEntity) {
    while (true) {
      const isCheckRuning = this.linksPrivate.find(item => item.id === link.id)// check còn nằm trong link
      if (!isCheckRuning) { break };
      const currentLink = await this.linkRepository.findOne({
        where: {
          id: link.id
        }
      })

      try {
        if (!currentLink) break;
        const dataComment = await this.facebookService.getCommentByToken(link.postId)

        const {
          commentId,
          commentMessage,
          phoneNumber,
          userIdComment,
          userNameComment,
          commentCreatedAt,
        } = dataComment || {}

        if (!commentId || !userIdComment) continue;
        const links = await this.selectLinkUpdate(link.id)
        const commentEntities: CommentEntity[] = []
        const linkEntities: LinkEntity[] = []

        for (const link of links) {
          const commentEntity: Partial<CommentEntity> = {
            cmtId: commentId,
            linkId: link.id,
            postId: link.postId,
            userId: link.userId,
            uid: userIdComment,
            message: commentMessage,
            phoneNumber,
            name: userNameComment,
            timeCreated: commentCreatedAt as any,
          }
          const comment = await this.getComment(link.id, link.userId, commentId)
          if (!comment) {
            commentEntities.push(commentEntity as CommentEntity)
          }

          const linkEntity: LinkEntity = { ...link, lastCommentTime: !link.lastCommentTime as any || dayjs.utc(commentCreatedAt).isAfter(dayjs.utc(link.lastCommentTime)) ? commentCreatedAt as any : link.lastCommentTime as any }
          linkEntities.push(linkEntity)
        }

        await Promise.all([this.commentRepository.save(commentEntities), this.linkRepository.save(linkEntities)])
      } catch (error) {
        console.log(`Crawl comment with postId ${link.postId} Error.`, error?.message)
      } finally {
        await this.delay((currentLink.delayTime ?? 5) * 1000)
      }
    }

  }

  getRandomNumber() {
    return Math.floor(Math.random() * 1000) + 1;
  }

  async handlePostsPrivate(linksRunning: LinkEntity[]) {
    const postHandle = linksRunning.map((link) => {
      return this.processLinkPrivate(link)
    })

    return Promise.all(postHandle)
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async cronjobHandleProfileUrl() {
    if (this.isHandleUrl) {
      return
    }

    const links = await this.getLinksWithoutProfile()
    if (links.length === 0) {
      this.isHandleUrl = false
      return
    };

    this.isHandleUrl = true
    const BATCH_SIZE = 10;

    for (let i = 0; i < links.length; i += BATCH_SIZE) {
      const batch = links.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (link) => {
        const { type, name, postId, pageId } = await this.facebookService.getProfileLink(link.linkUrl, link.id) || {} as any;
        if (postId) {
          const exitLink = await this.linkRepository.findOne({
            where: {
              postId,
              userId: link.userId
            }
          });
          if (exitLink) {
            await this.linkRepository.delete(link.id);
            return; // skip saving
          }
        }

        if (!link.linkName || link.linkName.length === 0) {
          link.linkName = name;
        }

        link.process = type === LinkType.UNDEFINED ? false : true;
        link.type = type;
        link.postId = postId;
        link.pageId = pageId

        if (type !== LinkType.UNDEFINED) {
          const delayTime = await this.getDelayTime(link.status, link.type)
          link.delayTime = delayTime
        }

        if (postId) {
          link.postIdV1 =
            type === LinkType.PRIVATE
              ? await this.facebookService.getPostIdV2WithCookie(link.linkUrl) || null
              : await this.facebookService.getPostIdPublicV2(link.linkUrl) || null;
        }

        await this.linkRepository.save(link);
      }));
    }

    this.isHandleUrl = false
  }

  async getDelayTime(status: LinkStatus, type: LinkType) {
    const setting = await this.delayRepository.find()
    return status === LinkStatus.Pending ? setting[0].delayOff * 60 : (type === LinkType.PUBLIC ? setting[0].delayOnPublic : setting[0].delayOnPrivate)
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async updateUUIDUser() {
    if (!this.isHandleUuid) {
      this.isHandleUuid = true
      await this.facebookService.updateUUIDUser()
      this.isHandleUuid = false
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handlePostIdV1WithCookie() {
    const links = await this.linkRepository.find({
      where: {
        type: LinkType.PRIVATE,
        postIdV1: IsNull()
      }
    })
    for (const link of links) {
      const cookie = await this.getCookieActiveFromDb()
      if (!cookie) return
      const postIdV1 = await this.facebookService.getPostIdV2WithCookie(link.linkUrl)
      if (postIdV1) {
        link.postIdV1 = postIdV1
        await this.linkRepository.save(link)
      }
    }
  }

  private getPostStarted(): Promise<LinkEntity[]> {
    return this.linkRepository.find({
      where: {
        status: LinkStatus.Started,
        type: Not(LinkType.DIE)
      }
    })
  }

  private groupPostsByType(links: LinkEntity[]): GroupedLinksByType {
    return links.reduce((acc, item) => {
      if (!acc[item.type]) {
        acc[item.type] = [];
      }
      acc[item.type].push(item);
      return acc;
    }, {} as Record<'public' | 'private', typeof links>);
  }

  selectLinkUpdate(id: number) {
    return this.linkRepository.find({
      where: {
        id,
        // status: LinkStatus.Started
      }
    })
  }

  private getComment(linkId: number, userId: number, cmtId: string) {
    return this.commentRepository.findOne({
      where: {
        linkId,
        userId,
        cmtId
      }
    })
  }

  private getLinksWithoutProfile() {
    return this.linkRepository.find({
      where: {
        process: false,
        postId: IsNull()
      },
      select: {
        linkUrl: true,
        id: true,
        postId: true,
        userId: true
      }
    })
  }

  async updateProcess(processDTO: ProcessDTO, level: LEVEL, userId: number) {
    if (level === LEVEL.USER) {
      const link = await this.linkRepository.findOne({
        where: {
          userId,
          id: processDTO.id
        },
      });

      if (!link) {
        throw new HttpException(`Bạn không có quyền.`, HttpStatus.CONFLICT);
      }
    }

    const link = await this.linkRepository.findOne({
      where: {
        id: processDTO.id
      },
    });
    const delayTime = await this.getDelayTime(processDTO.status, link.type)
    const dataUpdate = { ...processDTO, delayTime }

    const response = await this.linkRepository.save(dataUpdate);

    throw new HttpException(
      `${response.status === LinkStatus.Started ? 'Start' : 'Stop'} monitoring for link_id ${processDTO.id}`,
      HttpStatus.OK,
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getTokenActiveFromDb(): Promise<TokenEntity> {
    const tokens = await this.tokenRepository.find({
      where: {
        status: TokenStatus.ACTIVE,
        type: TokenHandle.CRAWL_CMT
      }
    })

    const randomIndex = Math.floor(Math.random() * tokens.length);
    const randomToken = tokens[randomIndex];

    return randomToken
  }

  async getCookieActiveFromDb(): Promise<CookieEntity> {
    const cookies = await this.cookieRepository.find({
      where: {
        status: CookieStatus.ACTIVE,
        user: {
          level: 1
        }
      },
      relations: {
        user: true
      },
    })
    const randomIndex = Math.floor(Math.random() * cookies.length);
    const randomCookie = cookies[randomIndex];

    return randomCookie
  }

  async getRandomProxy() {
    const proxies = await this.proxyRepository.find({
      where: {
        status: ProxyStatus.ACTIVE,
      }
    })
    const randomIndex = Math.floor(Math.random() * proxies.length);
    const randomProxy = proxies[randomIndex];

    return randomProxy
  }

  async updateActiveAllToken() {
    console.log("🚀 ~ MonitoringService ~ updateActiveAllToken ~ updateActiveAllToken:")
    const allToken = await this.tokenRepository.find({
      where: {
        status: TokenStatus.LIMIT
      }
    })

    return this.tokenRepository.save(allToken.map((item) => {
      return {
        ...item,
        status: TokenStatus.ACTIVE,
      }
    }))
  }

  async updateActiveAllCookie() {
    console.log("🚀 ~ MonitoringService ~ updateActiveAllCookie ~ updateActiveAllCookie:")
    const allCookie = await this.cookieRepository.find({
      where: {
        status: CookieStatus.LIMIT,
        user: {
          level: 1
        }
      },
      relations: {
        user: true
      },
    })

    return this.cookieRepository.save(allCookie.map((item) => {
      return {
        ...item,
        status: CookieStatus.ACTIVE,
      }
    }))
  }

  async updateActiveAllProxy() {
    console.log("🚀 ~ MonitoringService ~ updateActiveAllProxy ~ updateActiveAllProxy:")
    const allProxy = await this.proxyRepository.find({
      where: {
        status: ProxyStatus.IN_ACTIVE
      }
    })

    return this.proxyRepository.save(allProxy.map((item) => {
      return {
        ...item,
        status: ProxyStatus.ACTIVE,
      }
    }))
  }

  getHttpAgent(proxy: ProxyEntity) {
    const proxyArr = proxy?.proxyAddress.split(':')
    const agent = `http://${proxyArr[2]}:${proxyArr[3]}@${proxyArr[0]}:${proxyArr[1]}`
    const httpsAgent = new HttpsProxyAgent(agent);

    return httpsAgent;
  }
}
