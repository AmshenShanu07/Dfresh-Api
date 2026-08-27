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
  Generated,
} from 'typeorm';
import { OrderStatus, PaymentMethod, PaymentStatus } from 'src/common/enums';

@Entity('OrderDetails')
export class OrderDetails {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // DB-generated, sequence-backed and unique across the whole table forever —
  // the source of truth for the printed/WhatsApp order number (see
  // deriveOrderNumber). The old approach derived a display number from the
  // last 6 hex chars of `id`, which was only ever a UUID substring: not
  // guaranteed unique, and computed independently (differently) by one
  // WhatsApp message than by everything else. This column fixes both.
  @Column({ unique: true })
  @Generated('increment')
  orderSeq: number;

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

  // The area (sub-division of the ward) the customer's delivery address
  // resolved to, if the ward had any configured. When set, deliveryAgentId is
  // auto-assigned from Area.userId at address-confirmation time. Null when
  // the ward had no areas — falls back to manual dispatch-time agent picking.
  @Column({ type: 'varchar', nullable: true })
  areaId: string | null;

  // The outlet whose stock was actually deducted for this order, resolved
  // once by resolveFulfillingOutletId (Area.outletId when an area was
  // selected, else the same "oldest outlet for the ward" fallback dispatch
  // uses) and persisted at the point stock is first deducted. Read back
  // (never re-derived) by restoreStock so a later ward/outlet change can't
  // misattribute a cancellation credit. Null when no outlet could be
  // resolved (ward maps to no outlet) — outlet-level stock is skipped for
  // that order, same as before this column existed.
  @Column({ type: 'varchar', nullable: true })
  outletId: string | null;

  // The delivery agent (a User with userType OUTLET_AGENT) assigned to
  // deliver this order. Auto-set from the order's Area when one is present;
  // otherwise required before the order can move to DISPATCHED.
  @Column({ type: 'varchar', nullable: true })
  deliveryAgentId: string | null;

  // When the customer bill PDF was sent over WhatsApp. Set once by
  // WhatsappService.sendOrderBill so the several confirm paths (admin confirm,
  // COD select, UPI verify, status update) can each trigger a send without
  // ever re-sending. Null until the first successful send.
  @Column({ type: 'timestamp', nullable: true })
  billSentAt: Date | null;

  // Delivery confirmation OTP, generated once (by every CONFIRMED-transition
  // path) and never regenerated. Verified by the delivery agent to move the
  // order to DELIVERED. Also surfaced to admins on the order detail page as a
  // fallback if the WhatsApp OTP message doesn't reach the customer.
  @Column({ type: 'varchar', nullable: true })
  deliveryOtp: string | null;

  @Column({ type: 'timestamp', nullable: true })
  deliveryOtpGeneratedAt: Date | null;

  // Last time the OTP was successfully sent over WhatsApp; null until the
  // agent's first "Send OTP" click, refreshed on each resend.
  @Column({ type: 'timestamp', nullable: true })
  deliveryOtpSentAt: Date | null;

  // Set when the delivery agent's OTP entry matches deliveryOtp and the order
  // moves to DELIVERED. Null until then.
  @Column({ type: 'timestamp', nullable: true })
  deliveredAt: Date | null;

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

  @ManyToOne('Outlets')
  @JoinColumn({ name: 'outletId' })
  outlet: any;

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

  @Column({ type: 'varchar', nullable: true })
  pinCode: string;

  // Only WhatsApp self-checkout orders collect this (manual orders don't).
  @Column({ type: 'varchar', nullable: true })
  landmark: string;

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
