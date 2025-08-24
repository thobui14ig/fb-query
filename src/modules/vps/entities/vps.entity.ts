import { CookieEntity } from 'src/modules/cookie/entities/cookie.entity';
import { LinkEntity } from 'src/modules/links/entities/links.entity';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

export enum VpsStatus {
    Live = 'live',
    Die = 'die',
}

@Entity('vps')
export class VpsEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    ip: string

    @Column()
    port: number;

    @Column()
    speed: string;

    @Column({ default: VpsStatus.Live })
    status: VpsStatus;
}
