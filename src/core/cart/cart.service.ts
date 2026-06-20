import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart, CartItem } from './entities/cart.entity';
import { User } from '../users/entities/user.entity';
import { ProductVariant } from '../product/entities/product-variant.entity';
import { UserTypes } from 'src/common/enums';

/** Pre-resolved snapshot of an item to add to the cart. Charges are resolved
 * server-side by the caller (mirrors the snapshot built in placeItem). */
export interface CartItemInput {
  variantId: string;
  productId: string;
  price: number;
  cleaning: boolean;
  cleaningCharge: number;
  cutting: boolean;
  cuttingOption: string | null;
  cuttingCharge: number;
}

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepository: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepository: Repository<CartItem>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ProductVariant)
    private readonly productVariantRepository: Repository<ProductVariant>,
  ) {}

  private async getCustomerByPhone(phone: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { phone, userType: UserTypes.CUSTOMER },
    });
  }

  async getOrCreateCart(userId: string): Promise<Cart> {
    const existing = await this.cartRepository.findOne({ where: { userId } });
    if (existing) return existing;
    return this.cartRepository.save(this.cartRepository.create({ userId }));
  }

  /** Adds an item to the customer's cart, merging into an existing identical
   * line (same variant + cleaning + cutting + cutting style). Returns the cart
   * with its items, or null if the customer can't be resolved. */
  async addItem(phone: string, item: CartItemInput): Promise<Cart | null> {
    const user = await this.getCustomerByPhone(phone);
    if (!user) return null;

    const cart = await this.getOrCreateCart(user.id);

    const existingItem = await this.cartItemRepository.findOne({
      where: {
        cartId: cart.id,
        variantId: item.variantId,
        cleaning: item.cleaning,
        cutting: item.cutting,
        cuttingOption: item.cuttingOption,
      },
    });

    if (existingItem) {
      existingItem.quantity += 1;
      await this.cartItemRepository.save(existingItem);
    } else {
      await this.cartItemRepository.save(
        this.cartItemRepository.create({
          cartId: cart.id,
          productId: item.productId,
          variantId: item.variantId,
          quantity: 1,
          price: item.price,
          cleaning: item.cleaning,
          cleaningCharge: item.cleaningCharge,
          cutting: item.cutting,
          cuttingOption: item.cuttingOption,
          cuttingCharge: item.cuttingCharge,
        }),
      );
    }

    return this.getCart(phone);
  }

  /** Returns the customer's cart with items (+ product/variant relations), or null. */
  async getCart(phone: string): Promise<Cart | null> {
    const user = await this.getCustomerByPhone(phone);
    if (!user) return null;

    return this.cartRepository.findOne({
      where: { userId: user.id },
      relations: { cartItems: { product: true, variant: true } },
    });
  }

  /** Deletes a single cart line, then returns the updated cart. */
  async removeItem(phone: string, cartItemId: string): Promise<Cart | null> {
    await this.cartItemRepository.delete({ id: cartItemId });
    return this.getCart(phone);
  }

  /** Deletes all items in a cart (called after the cart is converted to an order). */
  async clearCart(cartId: string): Promise<void> {
    await this.cartItemRepository.delete({ cartId });
  }
}
