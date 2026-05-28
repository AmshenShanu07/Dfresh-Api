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
}
