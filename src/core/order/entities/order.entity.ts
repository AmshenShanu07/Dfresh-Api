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
import { OrderStatus, PaymentMethod, PaymentStatus } from 'src/common/enums';

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

  @Column({ type: 'enum', enum: PaymentMethod, nullable: true })
  paymentMethod: PaymentMethod | null;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.NOT_REQUIRED,
  })
  paymentStatus: PaymentStatus;

  @Column({ type: 'boolean', default: false })
  stockDeducted: boolean;

  // The share-catalog the reserved/deducted stock was taken from, so a later
  // cancel or expiry can credit the correct catalog even if a different one is
  // LIVE by then. Null when no catalog was LIVE at reservation time.
  @Column({ type: 'varchar', nullable: true })
  stockCatalogId: string | null;

  @Column({ type: 'varchar', nullable: true })
  paymentScreenshotUrl: string | null;

  @Column({ type: 'timestamp', nullable: true })
  paymentScreenshotAt: Date | null;

  // The ward the customer selected for this order's delivery address, captured
  // at checkout. Used to derive the serving outlet (Outlets.wardId) so a
  // delivery agent can be assigned before dispatch. Null for orders placed
  // before this was captured.
  @Column({ type: 'varchar', nullable: true })
  wardId: string | null;

  // The delivery agent (a User with userType DELIVERY_AGENT) assigned to
  // deliver this order. Required before the order can move to DISPATCHED.
  @Column({ type: 'varchar', nullable: true })
  deliveryAgentId: string | null;

  // When the customer bill PDF was sent over WhatsApp. Set once by
  // WhatsappService.sendOrderBill so the several confirm paths (admin confirm,
  // COD select, UPI verify, status update) can each trigger a send without
  // ever re-sending. Null until the first successful send.
  @Column({ type: 'timestamp', nullable: true })
  billSentAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne('User', 'OrderDetails')
  @JoinColumn({ name: 'userId' })
  user: any;

  @ManyToOne('User')
  @JoinColumn({ name: 'deliveryAgentId' })
  deliveryAgent: any;

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

  @Column({ type: 'varchar', nullable: true })
  variantId: string;

  @Column({ type: 'float' })
  quantity: number;

  @Column({ type: 'float' })
  price: number;

  @Column({ type: 'float' })
  totalPrice: number;

  @Column({ type: 'boolean', default: false })
  cleaning: boolean;

  @Column({ type: 'float', default: 0 })
  cleaningCharge: number;

  @Column({ type: 'boolean', default: false })
  cutting: boolean;

  @Column({ type: 'varchar', nullable: true, default: null })
  cuttingOption: string | null;

  @Column({ type: 'float', default: 0 })
  cuttingCharge: number;

  // Admin-recorded weight of the produce after cleaning. Record-only: does not
  // affect price/totalPrice. Unit is what the admin selected at entry ('g'|'kg').
  @Column({ type: 'float', nullable: true, default: null })
  cleanedWeight: number | null;

  @Column({ type: 'varchar', length: 2, nullable: true, default: null })
  cleanedWeightUnit: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne('Products', 'OrderItems')
  @JoinColumn({ name: 'productId' })
  product: any;

  @ManyToOne('ProductVariants', 'orderItems', { nullable: true })
  @JoinColumn({ name: 'variantId' })
  variant: any;

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
