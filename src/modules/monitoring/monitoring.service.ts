import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CommentEntity } from '../comments/entities/comment.entity';
import { FacebookService } from '../facebook/facebook.service';
import {
  LinkEntity,
  LinkStatus
} from '../links/entities/links.entity';
import { LEVEL } from '../user/entities/user.entity';
import { ProcessDTO } from './dto/process.dto';
import { GroupedLinksByType, IPostStarted } from './monitoring.service.i';

@Injectable()
export class MonitoringService {
  postIdRunning: string[] = []
  postsPublic: IPostStarted[] = []
  postsPrivate: IPostStarted[] = []

  proxy = {
    protocol: 'http',
    host: '38.153.152.244',
    port: 9594,
    auth: {
      username: 'pchwrbfj',
      password: 'ochbgqn9v4w3',
    },
  };

  constructor(
    @InjectRepository(LinkEntity)
    private linkRepository: Repository<LinkEntity>,
    @InjectRepository(CommentEntity)
    private commentRepository: Repository<CommentEntity>,
    private readonly facebookService: FacebookService,
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

  @Cron(CronExpression.EVERY_5_SECONDS)
  async handlePostsPublic() {
    if (this.postsPublic.length === 0) return;

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
        } = await this.facebookService.getCmt(encodedPostId, this.proxy);
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
        console.log(`Crawl comment with postId ${post.postId} Error.`, error)
      }
    }
    const postHandle = this.postsPublic.map((post) => {
      return process(post)
    })

    return Promise.all(postHandle)
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async cronjobHandleProfileUrl() {
    const links = await this.getLinksWithoutProfile()
    if (links.length === 0) return;

    for (const link of links) {
      const { type, name, postId } = await this.facebookService.getProfileLink(link.linkUrl, this.proxy) || {}
      if (!link.linkName || link.linkName.length === 0) {
        link.linkName = name
      }
      link.process = true;
      link.type = type
      link.postId = postId
      await this.linkRepository.save(link)
    }
  }

  handlePostsPrivate(links: IPostStarted[]) { }

  private getPostStarted(): Promise<IPostStarted[]> {
    return this.linkRepository
      .createQueryBuilder("link")
      .select("link.postId as postId, link.status, link.type")
      .where("link.status = :status", { status: LinkStatus.Started })
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
}
