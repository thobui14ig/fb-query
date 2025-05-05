import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export interface IDelay {
    id: number;
    delayCheck: number;
    updatedAt: Date;
    delayLinkOn: number;
    delayLinkOff: number;
}

@Entity('delay')
export class DelayEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'refresh_cookie', type: 'int', default: 0 })
    refreshCookie: number;

    @Column({ name: 'updated_at', type: 'datetime' })
    updatedAt: Date;

    @Column({ name: 'refresh_token', type: 'int', default: 0 })
    refreshToken: number;

    @Column({ name: 'refresh_proxy', type: 'int', default: 0 })
    refreshProxy: number;
}
