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

    @Column({ name: 'delaycheck', type: 'int', default: 0 })
    delayCheck: number;

    @Column({ name: 'updated_at', type: 'datetime' })
    updatedAt: Date;

    @Column({ name: 'delaylinkon', type: 'int', default: 0 })
    delayLinkOn: number;

    @Column({ name: 'delaylinkoff', type: 'int', default: 0 })
    delayLinkOff: number;
}
