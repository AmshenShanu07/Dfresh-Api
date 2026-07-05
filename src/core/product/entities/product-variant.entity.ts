import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { CuttingStyle } from '../../cutting-style/entities/cutting-style.entity';

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

  /**
   * Cleaning charge for this variant. Only meaningful when the parent
   * product has cleaning enabled (cleaning is a product-level flag).
   */
  @Column({ type: 'float', default: 0 })
  cleaningCharge: number;

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

/**
 * Per-variant price for a cutting style. The set of styles a variant carries
 * mirrors the parent product's selected styles (ProductCuttingStyle); this
 * entity only stores the price for each of them.
 */
@Entity('VariantCuttingStyles')
export class VariantCuttingStyle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  variantId: string;

  @Column({ type: 'varchar' })
  cuttingStyleId: string;

  @Column({ type: 'float', default: 0 })
  price: number;

  @Column({ type: 'boolean', default: false })
  isDeleted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne('ProductVariant', 'cuttingStyles')
  @JoinColumn({ name: 'variantId' })
  variant: ProductVariant;

  @ManyToOne(() => CuttingStyle)
  @JoinColumn({ name: 'cuttingStyleId' })
  cuttingStyle: CuttingStyle;
}
