import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { OrderStatus } from 'src/common/enums';

@Entity('OrderDetails')
export class OrderDetails {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'float' })
  totalAmount: number;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne('User', 'OrderDetails')
  @JoinColumn({ name: 'userId' })
  user: any;

  @OneToMany('OrderItems', 'order')
  orderItems: any[];

  @OneToOne('DeliveryDetails', 'order')
  deliveryDetails: any;
}

@Entity('OrderItems')
export class OrderItems {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  orderId: string;

  @Column({ type: 'varchar' })
  productId: string;

  @Column({ type: 'float' })
  quantity: number;

  @Column({ type: 'float' })
  price: number;

  @Column({ type: 'float' })
  totalPrice: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne('Products', 'OrderItems')
  @JoinColumn({ name: 'productId' })
  product: any;

  @ManyToOne('OrderDetails', 'orderItems')
  @JoinColumn({ name: 'orderId' })
  order: any;
}

@Entity('DeliveryDetails')
export class DeliveryDetails {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  address: string;

  @Column({ type: 'varchar' })
  phone: string;

  @Column({ type: 'varchar' })
  pinCode: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', unique: true })
  orderId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne('OrderDetails', 'deliveryDetails')
  @JoinColumn({ name: 'orderId' })
  order: any;
}
