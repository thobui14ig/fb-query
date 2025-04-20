import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ProcessDTO } from './dto/process.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import {
  LinkEntity,
  LinkStatus,
  LinkType,
} from '../links/entities/links.entity';
import { LEVEL } from '../user/entities/user.entity';
import { FacebookService } from '../facebook/facebook.service';
import { GroupedLinksByType, IPostStarted } from './monitoring.service.i';
import { CommentEntity } from '../comments/entities/comment.entity';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class MonitoringService {
  postIdRunning: string[] = []

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
    this.postIdRunning = postsStarted.map(item => item.postId)
    // return Promise.all([this.handlePostsPublic(groupPost.public), this.handlePostsPrivate(groupPost.private)])
    return Promise.all([this.handlePostsPublic(groupPost.public ?? [])])

  }

  async handlePostsPublic(posts: IPostStarted[]) {
    const proxy = {
      protocol: 'http',
      host: '38.153.152.244',
      port: 9594,
      auth: {
        username: 'pchwrbfj',
        password: 'ochbgqn9v4w3',
      },
    };

    const process = async (post: IPostStarted) => {
      while (true) {
        if (!this.postIdRunning.includes(post.postId)) {
          return;
        }
        console.log(2222)
        try {
          const postId = `feedback:${post.postId}`;
          const encodedPostId = Buffer.from(postId, 'utf-8').toString('base64');
          const {
            commentId,
            createdAt: userCommentAt,
            message,
            phoneNumber,
            userId: userCommentId,
            userName
          } = await this.facebookService.getCmt(encodedPostId, proxy);
          const links = await this.selectLinkUpdate(post.postId)
          const commentEntities: CommentEntity[] = []
          const linkEntities: LinkEntity[] = []

          for (const link of links) {
            const commentEntity: Partial<CommentEntity> = {
              cmtId: commentId,
              linkId: link.id,
              postId,
              userId: link.userId,
              uid: userCommentId,
              message,
              phoneNumber,
              name: userName,
              timeCreated: userCommentAt as any
            }
            const comment = await this.getComment(link.id, link.userId, commentId)
            commentEntities.push({ ...comment, ...commentEntity } as CommentEntity)

            const linkEntity: LinkEntity = { ...link, lastCommentTime: userCommentAt as any }
            linkEntities.push(linkEntity)
          }

          await Promise.all([this.commentRepository.save(commentEntities), this.linkRepository.save(linkEntities)])
          await this.delay(3000)
        } catch (error) {
          console.log("🚀 ~ MonitoringService ~ process ~ error:", error)
        }
      }
    }
    const postHandle = posts.map((post) => {
      return process(post)
    })

    return Promise.all(postHandle)
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

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
