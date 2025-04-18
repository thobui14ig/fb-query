import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';
import { CommentEntity } from 'src/modules/comments/entities/comment.entity';

export enum LinkStatus {
    Pending = 'pending',
    Started = 'started',
}

export enum LinkType {
    DIE = 'die',
    UNDEFINED = 'undefined',
    PUBLIC = 'public',
    PRIVATE = 'private',
}

@Entity('links')
export class LinkEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: "user_id" })
    userId: number;

    @Column({ length: 255, name: "link_name" })
    linkName: string;

    @Column({ length: 255, name: "link_url" })
    linkUrl: string;

    @Column({ length: 255, nullable: true, name: "post_id" })
    postId: string | null;

    @Column({ type: 'datetime', nullable: true, name: "last_comment_time" })
    lastCommentTime: Date | null;

    @Column({ type: 'int', default: 0, name: "comment_count" })
    commentCount: number;

    @Column({ type: 'int', default: 0, name: "delay_time" })
    delayTime: number;

    @Column({ type: 'int', default: 0 })
    like: number;

    @Column({ default: 'pending' })
    status: LinkStatus;

    @Column()
    type: LinkType

    @Column({ default: false })
    process: boolean;

    @CreateDateColumn({ type: 'datetime', name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;

    @ManyToOne(() => UserEntity, (user) => user.links)
    @JoinColumn({ name: 'user_id' })
    user: UserEntity

    @OneToMany(() => CommentEntity, (comment) => comment.link)
    comments: CommentEntity[]
}
