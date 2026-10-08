import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';

@Entity('Cart')
export class Cart {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  // The outlet the customer chose to shop from when their ward has more than
  // one selling outlet. Kept across sessions (the cart outlives an order) and
  // re-validated against the customer's current ward on every use.
  @Column({ type: 'varchar', nullable: true, default: null })
  outletId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne('User')
  @JoinColumn({ name: 'userId' })
  user: any;

  @OneToMany('CartItem', 'cart')
  cartItems: any[];
}

@Entity('CartItem')
export class CartItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  cartId: string;

  @Column({ type: 'varchar' })
  productId: string;

  @Column({ type: 'varchar', nullable: true })
  variantId: string;

  @Column({ type: 'float', default: 1 })
  quantity: number;

  @Column({ type: 'float' })
  price: number;

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

  @ManyToOne('Cart', 'cartItems')
  @JoinColumn({ name: 'cartId' })
  cart: any;

  @ManyToOne('Products')
  @JoinColumn({ name: 'productId' })
  product: any;

  @ManyToOne('ProductVariants', { nullable: true })
  @JoinColumn({ name: 'variantId' })
  variant: any;
}
