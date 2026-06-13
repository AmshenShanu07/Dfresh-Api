import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';

@Entity('ProductVariants')
export class ProductVariant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  productId: string;

  @Column({ type: 'float' })
  weight: number;

  @Column({ type: 'varchar', length: 2 })
  unit: 'g' | 'kg';

  @Column({ type: 'boolean', default: false })
  cleaning: boolean;

  @Column({ type: 'float', default: 0 })
  cleaningCharge: number;

  @Column({ type: 'boolean', default: false })
  cutting: boolean;

  @Column({ type: 'varchar', nullable: true, default: null })
  metaProductId: string;

  @Column({ type: 'boolean', default: false })
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  isDeleted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne('Products', 'variants')
  @JoinColumn({ name: 'productId' })
  product: any;

  @OneToMany('OrderItems', 'variant')
  orderItems: any[];

  @OneToMany('VariantCuttingStyle', 'variant')
  cuttingStyles: VariantCuttingStyle[];
}

@Entity('VariantCuttingStyles')
export class VariantCuttingStyle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  variantId: string;

  /** One of CUTTING_STYLES (master list). */
  @Column({ type: 'varchar' })
  style: string;

  @Column({ type: 'float', default: 0 })
  price: number;

  @Column({ type: 'boolean', default: false })
  isDeleted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne('ProductVariant', 'cuttingStyles')
  @JoinColumn({ name: 'variantId' })
  variant: ProductVariant;
}
