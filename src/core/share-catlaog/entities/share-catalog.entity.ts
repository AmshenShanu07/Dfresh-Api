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

  @Column({ type: 'varchar' })
  publishDate: string;

  @Column({ type: 'varchar' })
  publishTime: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne('Catalog', 'ShareCatalog')
  @JoinColumn({ name: 'catalogId' })
  catalog: any;

  @OneToMany('ShareCatalogProducts', 'shareCatalog')
  ShareCatalogProducts: any[];
}
