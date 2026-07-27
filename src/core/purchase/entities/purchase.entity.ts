import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ProductUnits } from 'src/common/enums';

@Entity('Purchase')
export class Purchase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  productId: string;

  @Column({ type: 'varchar' })
  outletId: string;

  @Column({ type: 'varchar' })
  supplierId: string;

  @Column({ type: 'varchar' })
  batchNumber: string;

  @Column({ type: 'float' })
  quantity: number;

  @Column({ type: 'enum', enum: ProductUnits })
  quantityUnit: ProductUnits;

  @Column({ type: 'float' })
  totalPrice: number;

  @Column({ type: 'float', nullable: true })
  releasedQtny: number;

  @Column({ type: 'enum', enum: ProductUnits, nullable: true })
  releasedQntyUnit: ProductUnits;

  @Column({ type: 'float', nullable: true })
  cleanedQnty: number;

  @Column({ type: 'enum', enum: ProductUnits, nullable: true })
  cleanedQntyUnit: ProductUnits;

  @Column({ type: 'float', nullable: true })
  cleanedCount: number;

  @Column({ type: 'float', nullable: true })
  thresholdQnty: number;

  @Column({ type: 'enum', enum: ProductUnits, nullable: true })
  thresholdQntyUnit: ProductUnits;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne('Outlets', 'Purchase')
  @JoinColumn({ name: 'outletId' })
  outlet: any;

  @ManyToOne('Products', 'Purchase')
  @JoinColumn({ name: 'productId' })
  product: any;

  @ManyToOne('User', 'Purchase')
  @JoinColumn({ name: 'supplierId' })
  supplier: any;
}
