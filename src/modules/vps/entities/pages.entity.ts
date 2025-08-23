import { CookieEntity } from 'src/modules/cookie/entities/cookie.entity';
import { LinkEntity } from 'src/modules/links/entities/links.entity';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

@Entity('pages')
export class PageEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 255 })
    name: string

    @Column({ name: 'created_by' })
    createdBy: number;

    @OneToMany(() => LinkEntity, (links) => links.page)
    links: LinkEntity[];

    @OneToMany(() => CookieEntity, (cookies) => cookies.page)
    cookies: CookieEntity[];
}
