import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';

@Entity('CatalogProducts')
export class CatalogProducts {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  catalogId: string;

  @Column({ type: 'varchar' })
  productId: string;

  @Column({ type: 'varchar', default: '' })
  productCatalogId: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne('Catalog', 'CatalogProducts')
  @JoinColumn({ name: 'catalogId' })
  catalog: any;

  @ManyToOne('Products', 'CatalogProducts')
  @JoinColumn({ name: 'productId' })
  product: any;

  @OneToMany('CatalogProductVariants', 'catalogProduct')
  catalogVariants: any[];
}
