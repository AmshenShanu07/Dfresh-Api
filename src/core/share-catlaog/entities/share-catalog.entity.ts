import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { ShareCatalogStatus } from 'src/common/enums';

@Entity('ShareCatalog')
export class ShareCatalog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  catalogId: string;

  @Column({ type: 'boolean', default: false })
  isDeleted: boolean;

  /**
   * Lifecycle:
   *  INACTIVE — admin turned it off (cron skips).
   *  ACTIVE   — enabled & scheduled, window not currently open.
   *  LIVE     — currently inside its day/time window and published to customers.
   *  PAUSED   — auto-set when no product is sellable (all stock exhausted);
   *             requires a manual resume after topping up quantities.
   */
  @Column({
    type: 'enum',
    enum: ShareCatalogStatus,
    default: ShareCatalogStatus.ACTIVE,
  })
  status: ShareCatalogStatus;

  @Column({ type: 'simple-array', default: '' })
  daysOfWeek: string[];

  @Column({ type: 'varchar' })
  startTime: string;

  @Column({ type: 'varchar' })
  endTime: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastWindowOpenedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne('Catalog', 'ShareCatalog')
  @JoinColumn({ name: 'catalogId' })
  catalog: any;

  @OneToMany('ShareCatalogProducts', 'shareCatalog')
  ShareCatalogProducts: any[];

  @OneToMany('ShareCatalogProductStock', 'shareCatalog')
  ShareCatalogProductStock: any[];
}
