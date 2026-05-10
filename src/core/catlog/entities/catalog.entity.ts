import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToMany,
  JoinTable,
} from 'typeorm';

@Entity('Catalog')
export class Catalog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar' })
  description: string;

  @Column({ type: 'boolean', default: false })
  isShared: boolean;

  @Column({ type: 'boolean', default: false })
  isDeleted: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  publishedDate: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany('CatalogProducts', 'catalog')
  CatalogProducts: any[];

  @OneToMany('ShareCatalog', 'catalog')
  ShareCatalog: any[];

  @ManyToMany('ShareCatalogProducts', 'Catalog')
  @JoinTable({
    name: '_CatalogToShareCatalogProducts',
    joinColumn: { name: 'A', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'B', referencedColumnName: 'id' },
  })
  ShareCatalogProducts: any[];
}
