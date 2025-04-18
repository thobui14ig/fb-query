import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export interface IKeyword {
    id: number;
    keyword: string | null;
    createdAt: Date;
    userId: number;
}

@Entity('keywords')
export class KeywordEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'text', nullable: true })
    keyword: string | null;

    @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;

    @Column({ name: 'user_id', type: 'int' })
    userId: number;
}
