import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

/**
 * Per-product stock allocation for a share catalog window (the "second
 * counter"). `offeredGrams` is the amount the admin set; `remainingGrams`
 * decrements as customers confirm orders, and governs which variants are
 * shown to customers and when the catalog auto-pauses.
 */
@Entity('ShareCatalogProductStock')
export class ShareCatalogProductStock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  shareCatalogId: string;

  @Column({ type: 'varchar' })
  productId: string;

  @Column({ type: 'float', default: 0 })
  offeredGrams: number;

  @Column({ type: 'float', default: 0 })
  remainingGrams: number;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne('Products', 'ShareCatalogProductStock')
  @JoinColumn({ name: 'productId' })
  product: any;

  @ManyToOne('ShareCatalog', 'ShareCatalogProductStock')
  @JoinColumn({ name: 'shareCatalogId' })
  shareCatalog: any;
}
