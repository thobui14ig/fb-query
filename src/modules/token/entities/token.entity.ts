import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
export enum TokenStatus {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
    LIMIT = 'limit',
    DIE = 'die',
}

@Entity('token')
export class TokenEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'token_value', type: 'varchar', length: 255 })
    tokenValue: string;

    @Column({ type: 'enum', enum: TokenStatus, default: TokenStatus.ACTIVE })
    status: TokenStatus;
}
