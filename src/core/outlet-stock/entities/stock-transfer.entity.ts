import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ProductUnits } from 'src/common/enums';

/**
 * Audit record of an admin moving stock of one product from one outlet to
 * another. quantity/quantityUnit are the display values the admin entered
 * (mirrors Purchase), not the base-unit amount actually applied.
 */
@Entity('StockTransfer')
export class StockTransfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  productId: string;

  @Column({ type: 'varchar' })
  fromOutletId: string;

  @Column({ type: 'varchar' })
  toOutletId: string;

  @Column({ type: 'float' })
  quantity: number;

  @Column({ type: 'enum', enum: ProductUnits })
  quantityUnit: ProductUnits;

  @Column({ type: 'varchar' })
  movedByUserId: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne('Products')
  @JoinColumn({ name: 'productId' })
  product: any;

  @ManyToOne('Outlets')
  @JoinColumn({ name: 'fromOutletId' })
  fromOutlet: any;

  @ManyToOne('Outlets')
  @JoinColumn({ name: 'toOutletId' })
  toOutlet: any;

  @ManyToOne('User')
  @JoinColumn({ name: 'movedByUserId' })
  movedBy: any;
}
