import { HttpException, HttpStatus, Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Like, Not, Repository } from 'typeorm';
import { CommentEntity } from '../comments/entities/comment.entity';
import { FacebookService } from '../facebook/facebook.service';
import {
  LinkEntity,
  LinkStatus,
  LinkType
} from '../links/entities/links.entity';
import { LEVEL } from '../user/entities/user.entity';
import { ProcessDTO } from './dto/process.dto';
import { GroupedLinksByType, IPostStarted } from './monitoring.service.i';
import { HttpsProxyAgent } from "https-proxy-agent";
import { TokenEntity, TokenStatus } from '../token/entities/token.entity';
import { CookieEntity, CookieStatus } from '../cookie/entities/cookie.entity';
import { ProxyEntity, ProxyStatus } from '../proxy/entities/proxy.entity';
import { DelayEntity } from '../setting/entities/delay.entity';

type RefreshKey = 'refreshToken' | 'refreshCookie' | 'refreshProxy';
@Injectable()
export class MonitoringService implements OnModuleInit {
  postIdRunning: string[] = []
  linksPublic: LinkEntity[] = []
  linksPrivate: LinkEntity[] = []
  isHandleUrl: boolean = false
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

  ) { }

  async onModuleInit() {
    // Bắt đầu kiểm tra định kỳ từng loại
    ['refreshToken', 'refreshCookie', 'refreshProxy'].forEach((key: RefreshKey) => {
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
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async startMonitoring() {
    const postsStarted = await this.getPostStarted()
    const groupPost = this.groupPostsByType(postsStarted || []);

    return Promise.all([this.handleStartMonitoring((groupPost.public || []), LinkType.PUBLIC), this.handleStartMonitoring((groupPost.private || []), LinkType.PRIVATE)])
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async startProcessTotalCount() {
    const postsStarted = await this.getPostStarted()
    const groupPost = this.groupPostsByType(postsStarted || []);

    const processLinksPulic = async () => {
      for (const link of groupPost.public ?? []) {
        const proxy = await this.getRandomProxy()
        if (!proxy) continue
        const postId = `feedback:${link.postId}`;
        const encodedPostId = Buffer.from(postId, 'utf-8').toString('base64');
        const {
          totalCount
        } = await this.facebookService.getCmtPublic(encodedPostId, proxy, link.postId) || {}
        if (totalCount) {
          link.commentCount = totalCount - (link.commentCount ?? 0)
          await this.linkRepository.save(link)
        }
      }
    }

    const processLinksPrivate = async () => {
      for (const link of groupPost.private ?? []) {
        const proxy = await this.getRandomProxy()
        if (!proxy) continue

        let { totalCount } = await this.facebookService.getCommentByCookie(proxy, link.postIdV1 ?? link.postId) || {}
        if (totalCount) {
          link.commentCount = totalCount - (link.commentCount ?? 0)
          await this.linkRepository.save(link)
        }
      }
    }

    return Promise.all([processLinksPulic(), processLinksPrivate()])
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
        let isPrivate = false
        if (!currentLink) break;
        const proxy = await this.getRandomProxy()
        if (!proxy) continue
        const postId = `feedback:${link.postId}`;
        const encodedPostId = Buffer.from(postId, 'utf-8').toString('base64');
        let res = await this.facebookService.getCmtPublic(encodedPostId, proxy, link.postId) || {} as any

        if ((!res.commentId || !res.userIdComment) && link.postIdV1) {
          const postId = `feedback:${link.postIdV1}`;
          const encodedPostIdV1 = Buffer.from(postId, 'utf-8').toString('base64');
          res = await this.facebookService.getCmtPublic(encodedPostIdV1, proxy, link.postIdV1) || {} as any
        }

        if (!res.commentId || !res.userIdComment) {
          res = await this.facebookService.getCommentByCookie(proxy, link.postIdV1 ?? link.postId) || {}
          isPrivate = true
        }

        if (!res.commentId || !res.userIdComment) {
          res = await this.facebookService.getCommentByToken(link.postId, proxy) || {}
          isPrivate = true
        }

        if (!res?.commentId || !res?.userIdComment) continue;
        const links = await this.selectLinkUpdate(link.postId)
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
          commentEntities.push({ ...comment, ...commentEntity } as CommentEntity)
          if (isPrivate) {
            link.type = LinkType.PRIVATE
          }

          const linkEntity: LinkEntity = { ...link, lastCommentTime: commentCreatedAt as any }
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
        const proxy = await this.getRandomProxy()
        if (!proxy) continue

        let dataComment = await this.facebookService.getCommentByCookie(proxy, link.postIdV1 ?? link.postId) || {}

        if (!dataComment || !(dataComment as any)?.commentId) {
          dataComment = await this.facebookService.getCommentByToken(link.postId, proxy) || {}
        }
        const {
          commentId,
          commentMessage,
          phoneNumber,
          userIdComment,
          userNameComment,
          commentCreatedAt
        } = dataComment as any

        if (!commentId || !userIdComment) continue;
        const links = await this.selectLinkUpdate(link.postId)
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
            timeCreated: commentCreatedAt as any
          }
          const comment = await this.getComment(link.id, link.userId, commentId)
          commentEntities.push({ ...comment, ...commentEntity } as CommentEntity)

          const linkEntity: LinkEntity = { ...link, lastCommentTime: commentCreatedAt as any }
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
    const proxy = await this.getRandomProxy()
    if (!proxy) {
      this.isHandleUrl = false
      return
    };

    this.isHandleUrl = true
    for (const link of links) {
      const { type, name, postId } = await this.facebookService.getProfileLink(link.linkUrl, proxy) || {};
      if (postId) {
        const exitLink = await this.linkRepository.findOne({
          where: {
            postId
          }
        })
        if (exitLink) {
          await this.linkRepository.delete(link.id)
          continue
        }
      }

      if (!link.linkName || link.linkName.length === 0) {
        link.linkName = name;
      }
      link.process = type === LinkType.UNDEFINED ? false : true;
      link.type = type;
      link.postId = postId;
      link.postIdV1 = type === LinkType.PRIVATE ? (await this.facebookService.getPostIdV2(link.linkUrl) || null) : (await this.facebookService.getPostIdPublicV2(link.linkUrl) || null)

      await this.linkRepository.save(link);
    }

    this.isHandleUrl = false
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async updateUUIDUser() {
    return this.facebookService.updateUUIDUser()
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
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
      const postIdV1 = await this.facebookService.getPostIdV2(link.linkUrl)
      if (postIdV1) {
        link.postIdV1 = postIdV1
        await this.linkRepository.save(link)
      }
    }
  }

  private getPostStarted(): Promise<LinkEntity[]> {
    return this.linkRepository.find({
      where: {
        // status: LinkStatus.Started,
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

  selectLinkUpdate(postId: string) {
    return this.linkRepository.find({
      where: {
        postId,
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
        postId: true
      }
    })
  }


  async updateProcess(processDTO: ProcessDTO, level: LEVEL, userId: number) {
    if (level === LEVEL.USER) {
      const link = await this.linkRepository.findOne({
        where: {
          userId,
        },
      });

      if (!link) {
        throw new HttpException(`Bạn không có quyền.`, HttpStatus.CONFLICT);
      }
    }

    const response = await this.linkRepository.save(processDTO);

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
        status: TokenStatus.ACTIVE
      }
    })

    const randomIndex = Math.floor(Math.random() * tokens.length);
    const randomToken = tokens[randomIndex];

    return randomToken
  }

  async getCookieActiveFromDb(): Promise<CookieEntity> {
    const cookies = await this.cookieRepository.find({
      where: {
        status: CookieStatus.ACTIVE
      }
    })
    const randomIndex = Math.floor(Math.random() * cookies.length);
    const randomCookie = cookies[randomIndex];

    return randomCookie
  }

  async getRandomProxy() {
    const proxies = await this.proxyRepository.find({
      where: {
        status: ProxyStatus.ACTIVE
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
        retryCount: item.retryCount + 1
      }
    }))
  }

  async updateActiveAllCookie() {
    console.log("🚀 ~ MonitoringService ~ updateActiveAllCookie ~ updateActiveAllCookie:")
    const allCookie = await this.cookieRepository.find({
      where: {
        status: CookieStatus.LIMIT
      }
    })

    return this.tokenRepository.save(allCookie.map((item) => {
      return {
        ...item,
        status: TokenStatus.ACTIVE,
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
}
