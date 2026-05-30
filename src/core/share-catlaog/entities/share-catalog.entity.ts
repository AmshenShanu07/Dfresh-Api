import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';

@Entity('ShareCatalog')
export class ShareCatalog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  catalogId: string;

  @Column({ type: 'boolean', default: false })
  isDeleted: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  isPublished: boolean;

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
}
