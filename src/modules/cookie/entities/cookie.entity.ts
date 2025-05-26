import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export enum CookieStatus {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
    LIMIT = 'limit',
    DIE = 'die',
}

@Entity('cookie')
export class CookieEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'text' })
    cookie: string;

    @Column({ name: 'created_by' })
    createdBy: number;

    @Column({ type: 'enum', enum: CookieStatus, default: CookieStatus.ACTIVE })
    status: CookieStatus;
}