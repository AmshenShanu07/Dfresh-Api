import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CuttingStyle } from '../../cutting-style/entities/cutting-style.entity';

/**
 * Join between a product and the cutting styles it offers. Cutting is a
 * product-level concept: every variant of the product offers these styles
 * (each variant sets its own price via VariantCuttingStyle).
 */
@Entity('ProductCuttingStyles')
export class ProductCuttingStyle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  productId: string;

  @Column({ type: 'varchar' })
  cuttingStyleId: string;

  @Column({ type: 'boolean', default: false })
  isDeleted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne('Products', 'productCuttingStyles')
  @JoinColumn({ name: 'productId' })
  product: any;

  @ManyToOne(() => CuttingStyle)
  @JoinColumn({ name: 'cuttingStyleId' })
  cuttingStyle: CuttingStyle;
}
