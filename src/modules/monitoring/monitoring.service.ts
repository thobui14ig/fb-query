import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
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

@Injectable()
export class MonitoringService {
  postIdRunning: string[] = []
  postsPublic: IPostStarted[] = []
  postsPrivate: IPostStarted[] = []
  isHandleUrl: boolean = false

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
    private proxyRepository: Repository<ProxyEntity>
  ) { }

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

  @Cron(CronExpression.EVERY_5_SECONDS)
  async startMonitoring() {
    const postsStarted = await this.getPostStarted()
    const groupPost = this.groupPostsByType(postsStarted || []);
    this.postsPublic = groupPost.public ?? [];
    this.postsPrivate = groupPost.private ?? [];
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async handlePostsPublic() {
    if (this.postsPublic.length === 0) return;
    const cookie = await this.getCookieActiveFromDb()
    if (!cookie) return
    const proxy = await this.getRandomProxy()
    if (!proxy) return

    const process = async (post: IPostStarted) => {
      try {
        const postId = `feedback:${post.postId}`;
        const encodedPostId = Buffer.from(postId, 'utf-8').toString('base64');
        const {
          commentId,
          commentMessage,
          phoneNumber,
          userIdComment,
          userNameComment,
          commentCreatedAt
        } = await this.facebookService.getCmtPublic(encodedPostId, proxy, cookie) || {}


        if (!commentId || !userIdComment) return;
        const links = await this.selectLinkUpdate(post.postId)
        const commentEntities: CommentEntity[] = []
        const linkEntities: LinkEntity[] = []

        for (const link of links) {
          const commentEntity: Partial<CommentEntity> = {
            cmtId: commentId,
            linkId: link.id,
            postId: post.postId,
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
        await this.delay(3000)
      } catch (error) {
        console.log(`Crawl comment with postId ${post.postId} Error.`, error?.message)
      }
    }
    const postHandle = this.postsPublic.map((post) => {
      return process(post)
    })

    return Promise.all(postHandle)
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async cronjobHandleProfileUrl() {
    if (this.isHandleUrl) {
      console.log("🚀 ~ MonitoringService ~ cronjobHandleProfileUrl ~ this.isHandleUrl:", this.isHandleUrl)
      return
    }


    const links = await this.getLinksWithoutProfile()
    if (links.length === 0) return;
    const proxy = await this.getRandomProxy()
    if (!proxy) return
    this.isHandleUrl = true
    const tasks = links.map(async (link) => {
      const { type, name, postId } = await this.facebookService.getProfileLink(link.linkUrl, proxy) || {};

      if (!link.linkName || link.linkName.length === 0) {
        link.linkName = name;
      }
      link.process = true;
      link.type = type;
      link.postId = postId;

      await this.linkRepository.save(link);
    });

    await Promise.all(tasks);
    this.isHandleUrl = false
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async handlePostsPrivate() {
    if (this.postsPrivate.length === 0) return;
    const token = await this.getTokenActiveFromDb()
    if (!token) {
      return this.updateActiveAllToken()
    }
    const proxy = await this.getRandomProxy()
    if (!proxy) return

    const process = async (post: IPostStarted) => {
      try {
        const {
          commentId,
          commentMessage,
          phoneNumber,
          userIdComment,
          userNameComment,
          commentCreatedAt
        } = await this.facebookService.getCommentByToken(post.postId, proxy, token) || {}

        if (!commentId || !userIdComment) return;
        const links = await this.selectLinkUpdate(post.postId)
        const commentEntities: CommentEntity[] = []
        const linkEntities: LinkEntity[] = []

        for (const link of links) {
          const commentEntity: Partial<CommentEntity> = {
            cmtId: commentId,
            linkId: link.id,
            postId: post.postId,
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
        await this.delay(3000)
      } catch (error) {
        console.log(`Crawl comment with postId ${post.postId} Error.`, error?.message)
      }
    }
    const postHandle = this.postsPrivate.map((post) => {
      return process(post)
    })

    return Promise.all(postHandle)
  }

  private getPostStarted(): Promise<IPostStarted[]> {
    return this.linkRepository
      .createQueryBuilder("link")
      .select("link.postId as postId, link.status, link.type")
      .where("link.status = :status AND link.type != :type", { status: LinkStatus.Started, type: LinkType.DIE })
      .andWhere("link.postId IS NOT NULL")
      .groupBy("link.postId, link.status, link.type")
      .getRawMany();
  }

  private groupPostsByType(links: IPostStarted[]): GroupedLinksByType {
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
        status: LinkStatus.Started
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

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getTokenActiveFromDb(): Promise<TokenEntity> {
    return this.tokenRepository.findOne({
      where: {
        status: TokenStatus.ACTIVE
      }
    })
  }

  getCookieActiveFromDb(): Promise<CookieEntity> {
    return this.cookieRepository.findOne({
      where: {
        status: CookieStatus.ACTIVE
      }
    })
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
        retryCount: LessThan(4)
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
}
