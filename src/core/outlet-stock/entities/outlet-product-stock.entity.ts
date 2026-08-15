import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';

/**
 * Current stock of one product at one outlet, in the product's base unit
 * (grams/ml/count, per Products.measurementType) — the same convention as
 * Products.totalQuantity. One row per (outletId, productId), created lazily
 * on first write (a purchase, a transfer-in, or an order decrement).
 */
@Entity('OutletProductStock')
@Unique(['outletId', 'productId'])
export class OutletProductStock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  outletId: string;

  @Column({ type: 'varchar' })
  productId: string;

  @Column({ type: 'float', default: 0 })
  quantity: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne('Outlets')
  @JoinColumn({ name: 'outletId' })
  outlet: any;

  @ManyToOne('Products')
  @JoinColumn({ name: 'productId' })
  product: any;
}
