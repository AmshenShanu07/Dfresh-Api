import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  ManyToMany,
  JoinColumn,
} from 'typeorm';
import { ProductUnits } from 'src/common/enums';

@Entity('ShareCatalogProducts')
export class ShareCatalogProducts {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  shareCatalogId: string;

  @Column({ type: 'varchar' })
  productId: string;

  @Column({ type: 'varchar', nullable: true, default: null })
  variantId: string;

  @Column({ type: 'float' })
  qnty: number;

  @Column({ type: 'enum', enum: ProductUnits })
  qntyUnit: ProductUnits;

  @Column({ type: 'float' })
  price: number;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne('Products', 'ShareCatalogProducts')
  @JoinColumn({ name: 'productId' })
  product: any;

  @ManyToOne('ProductVariants', 'id')
  @JoinColumn({ name: 'variantId' })
  variant: any;

  @ManyToOne('ShareCatalog', 'ShareCatalogProducts')
  @JoinColumn({ name: 'shareCatalogId' })
  shareCatalog: any;

  @ManyToMany('Catalog', 'ShareCatalogProducts')
  Catalog: any[];
}
