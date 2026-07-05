import { Injectable } from '@nestjs/common';
import { UpdateOrderDto } from './dto/update-order.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderDetails, OrderItems, DeliveryDetails } from './entities/order.entity';
import { User } from '../users/entities/user.entity';
import { ProductVariant } from '../product/entities/product-variant.entity';
import { Products } from '../product/entities/product.entity';
import { ShareCatalog } from '../share-catlaog/entities/share-catalog.entity';
import { ShareCatalogProductStock } from '../share-catlaog/entities/share-catalog-product-stock.entity';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ShareCatalogStatus,
  UserTypes,
} from 'src/common/enums';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(OrderDetails)
    private readonly orderDetailsRepository: Repository<OrderDetails>,
    @InjectRepository(OrderItems)
    private readonly orderItemsRepository: Repository<OrderItems>,
    @InjectRepository(DeliveryDetails)
    private readonly deliveryDetailsRepository: Repository<DeliveryDetails>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ProductVariant)
    private readonly productVariantRepository: Repository<ProductVariant>,
    @InjectRepository(Products)
    private readonly productRepository: Repository<Products>,
    @InjectRepository(ShareCatalog)
    private readonly shareCatalogRepository: Repository<ShareCatalog>,
    @InjectRepository(ShareCatalogProductStock)
    private readonly shareCatalogProductStockRepository: Repository<ShareCatalogProductStock>,
  ) {}

  /**
   * Deducts confirmed order quantities (variant weight x qty, in grams) from
   * both the product master stock and the live share-catalog allocation.
   * Idempotent via the OrderDetails.stockDeducted flag. If the live catalog
   * runs out of sellable products, it is auto-paused.
   */
  private async applyStockDeduction(orderId: string) {
    const order = await this.orderDetailsRepository.findOne({
      where: { id: orderId },
      relations: { orderItems: { variant: true } },
    });
    if (!order || order.stockDeducted) return;

    // Mark first to guard against concurrent/duplicate confirmations.
    await this.orderDetailsRepository.update(orderId, { stockDeducted: true });

    const live = await this.shareCatalogRepository.findOne({
      where: { status: ShareCatalogStatus.LIVE, isDeleted: false },
      relations: { ShareCatalogProductStock: true },
    });

    for (const item of order.orderItems ?? []) {
      const weight = item.variant?.weight ?? 0;
      const grams = weight * (item.quantity ?? 0);
      if (grams <= 0) continue;

      await this.productRepository.decrement(
        { id: item.productId },
        'totalQuantity',
        grams,
      );

      if (live) {
        const stock = (live.ShareCatalogProductStock ?? []).find(
          (s: any) => s.productId === item.productId,
        );
        if (stock) {
          stock.remainingGrams = Math.max(0, stock.remainingGrams - grams);
          await this.shareCatalogProductStockRepository.save(stock);
        }
      }
    }

    if (live) {
      await this.pauseIfExhausted(live.id);
    }
  }

  /** Auto-pauses the live catalog when no product fits its remaining stock. */
  private async pauseIfExhausted(catalogId: string) {
    const catalog = await this.shareCatalogRepository.findOne({
      where: { id: catalogId },
      relations: {
        ShareCatalogProducts: { variant: true },
        ShareCatalogProductStock: true,
      },
    });
    if (!catalog || catalog.status !== ShareCatalogStatus.LIVE) return;

    const remainingByProduct = new Map<string, number>();
    for (const s of catalog.ShareCatalogProductStock ?? []) {
      remainingByProduct.set(s.productId, s.remainingGrams);
    }
    const anySellable = (catalog.ShareCatalogProducts ?? []).some((scp: any) => {
      const remaining = remainingByProduct.get(scp.productId) ?? 0;
      const weight = scp.variant?.weight ?? Infinity;
      return remaining > 0 && weight <= remaining;
    });

    if (!anySellable) {
      const variantIds = (catalog.ShareCatalogProducts ?? [])
        .filter((scp: any) => scp.variantId)
        .map((scp: any) => scp.variantId);
      if (variantIds.length) {
        await this.productVariantRepository
          .createQueryBuilder()
          .update(ProductVariant)
          .set({ isActive: false })
          .whereInIds(variantIds)
          .execute();
      }
      await this.shareCatalogRepository.update(catalogId, {
        status: ShareCatalogStatus.PAUSED,
      });
    }
  }

  async createOrder(phone: string, products: any[]) {
    try {
      const user = await this.userRepository.findOne({
        where: { phone, userType: UserTypes.CUSTOMER },
      });

      if (!user) return null;

      const order = await this.orderDetailsRepository.save(
        this.orderDetailsRepository.create({
          userId: user.id,
          status: OrderStatus.DRAFT,
          totalAmount: products.reduce((acc, product) => {
            const addOns =
              parseFloat(product.cleaningCharge ?? 0) +
              parseFloat(product.cuttingCharge ?? 0);
            return (
              acc +
              (parseFloat(product.item_price) + addOns) *
                parseFloat(product.quantity)
            );
          }, 0),
        }),
      );

      if (!order) return null;

      console.log('order', products);

      await Promise.all(
        products.map(async (product) => {
          const variant = await this.productVariantRepository.findOne({
            where: { id: product.product_retailer_id },
          });
          console.log('variant:', variant);
          
          if (!variant) {
            console.warn(`createOrder: variant not found for product_retailer_id=${product.product_retailer_id}`);
            return;
          }

          const cleaningCharge = parseFloat(product.cleaningCharge ?? 0) || 0;
          const cuttingCharge = parseFloat(product.cuttingCharge ?? 0) || 0;
          const quantity = parseFloat(product.quantity);
          const basePrice = parseFloat(product.item_price);

          return this.orderItemsRepository.save(
            this.orderItemsRepository.create({
              orderId: order.id,
              productId: variant.productId,
              variantId: variant.id,
              quantity,
              price: basePrice,
              totalPrice: (basePrice + cleaningCharge + cuttingCharge) * quantity,
              cleaning: product.cleaning ?? false,
              cleaningCharge,
              cutting: product.cutting ?? false,
              cuttingOption: product.cuttingOption ?? null,
              cuttingCharge,
            }),
          );
        }),
      );

      return order;
    } catch (error) {
      console.log('error', error);
    }
  }

  async findAll(filter: { pageNumber?: number; count?: number; status?: string }) {
    const takeCount = parseInt((filter.count ?? 10) + '');
    const skipCount = (parseInt((filter.pageNumber ?? 1) + '') - 1) * takeCount;

    const where: any = {};
    if (filter.status) where.status = filter.status;

    const [total, data] = await Promise.all([
      this.orderDetailsRepository.count({ where }),
      this.orderDetailsRepository.find({
        where,
        relations: { user: true, orderItems: true },
        order: { createdAt: 'DESC' },
        take: takeCount,
        skip: skipCount,
      }),
    ]);

    return { total, data };
  }

  async findOne(id: string) {
    return this.orderDetailsRepository.findOne({
      where: { id },
      relations: {
        user: true,
        orderItems: { product: { category: true } },
        deliveryDetails: true,
      },
    });
  }

  async confirmOrder(id: string) {
    await this.orderDetailsRepository.update(id, { status: OrderStatus.CONFIRMED });
    await this.applyStockDeduction(id);
    return { success: true };
  }

  async cancelOrder(id: string) {
    await this.orderDetailsRepository.update(id, { status: OrderStatus.CANCELLED });
    return { success: true };
  }

  /**
   * Single-call update from the admin order-detail page: persists the chosen
   * status and per-item cleaned weights. Returns the fully-loaded order plus a
   * `statusChanged` flag so the caller can decide whether to notify the
   * customer. Cleaned weight is record-only and never touches pricing.
   */
  async updateOrderDetails(
    id: string,
    dto: {
      status?: OrderStatus;
      items?: {
        id: string;
        cleanedWeight: number | null;
        cleanedWeightUnit: string | null;
      }[];
    },
  ) {
    const existing = await this.orderDetailsRepository.findOne({
      where: { id },
      relations: { user: true, deliveryDetails: true },
    });
    if (!existing) return null;

    // Persist cleaned weights, guarding to items that belong to this order.
    for (const item of dto.items ?? []) {
      await this.orderItemsRepository.update(
        { id: item.id, orderId: id },
        {
          cleanedWeight: item.cleanedWeight,
          cleanedWeightUnit: item.cleanedWeightUnit,
        },
      );
    }

    const statusChanged =
      dto.status != null && dto.status !== existing.status;

    if (statusChanged) {
      await this.orderDetailsRepository.update(id, { status: dto.status });
      if (dto.status === OrderStatus.CONFIRMED) {
        await this.applyStockDeduction(id);
      }
    }

    const order = await this.findOne(id);
    return { order, statusChanged };
  }

  async updateOrderAddress(addressData: any) {
    try {
      await this.deliveryDetailsRepository.save(
        this.deliveryDetailsRepository.create({
          orderId: addressData.flow_token,
          address: addressData.address,
          pinCode: addressData.pincode,
          phone: addressData.phone,
          name: addressData.name,
        }),
      );

      await this.orderDetailsRepository.update(addressData.flow_token, {
        status: OrderStatus.PENDING,
      });

      const order = await this.orderDetailsRepository.findOne({
        where: { id: addressData.flow_token },
        relations: { orderItems: { product: true }, deliveryDetails: true },
      });

      return order;
    } catch (error) {
      console.error('Error updating order address:', error);
      return null;
    }
  }

  async confirmOrderWithAddress(
    orderId: string,
    address: { name: string; address: string; pinCode: string; phone: string },
  ) {
    try {
      await this.deliveryDetailsRepository.save(
        this.deliveryDetailsRepository.create({
          orderId,
          address: address.address,
          pinCode: address.pinCode,
          phone: address.phone,
          name: address.name,
        }),
      );

      await this.orderDetailsRepository.update(orderId, {
        status: OrderStatus.PENDING,
      });

      const order = await this.orderDetailsRepository.findOne({
        where: { id: orderId },
        relations: { orderItems: { product: true }, deliveryDetails: true },
      });

      return order;
    } catch (error) {
      console.error('Error confirming order address:', error);
      return null;
    }
  }

  async selectPaymentMethod(orderId: string, method: PaymentMethod) {
    const updates: Partial<OrderDetails> = { paymentMethod: method };
    if (method === PaymentMethod.COD) {
      updates.paymentStatus = PaymentStatus.NOT_REQUIRED;
      updates.status = OrderStatus.CONFIRMED;
    } else {
      updates.paymentStatus = PaymentStatus.AWAITING_SCREENSHOT;
    }

    await this.orderDetailsRepository.update(orderId, updates);

    if (updates.status === OrderStatus.CONFIRMED) {
      await this.applyStockDeduction(orderId);
    }

    return this.orderDetailsRepository.findOne({
      where: { id: orderId },
      relations: { orderItems: { product: true }, deliveryDetails: true },
    });
  }

  async findAwaitingScreenshotOrderByPhone(phone: string) {
    const user = await this.userRepository.findOne({
      where: { phone, userType: UserTypes.CUSTOMER },
    });
    if (!user) return null;

    return this.orderDetailsRepository.findOne({
      where: {
        userId: user.id,
        paymentStatus: PaymentStatus.AWAITING_SCREENSHOT,
      },
      order: { createdAt: 'DESC' },
    });
  }

  async attachPaymentScreenshot(orderId: string, url: string) {
    await this.orderDetailsRepository.update(orderId, {
      paymentScreenshotUrl: url,
      paymentScreenshotAt: new Date(),
      paymentStatus: PaymentStatus.AWAITING_VERIFICATION,
    });
    return this.orderDetailsRepository.findOne({ where: { id: orderId } });
  }

  async verifyPayment(orderId: string) {
    const order = await this.orderDetailsRepository.findOne({
      where: { id: orderId },
    });
    if (!order) return null;
    if (
      order.paymentMethod !== PaymentMethod.UPI ||
      order.paymentStatus !== PaymentStatus.AWAITING_VERIFICATION
    ) {
      return null;
    }

    await this.orderDetailsRepository.update(orderId, {
      paymentStatus: PaymentStatus.VERIFIED,
      status: OrderStatus.CONFIRMED,
    });

    await this.applyStockDeduction(orderId);

    return this.orderDetailsRepository.findOne({
      where: { id: orderId },
      relations: { orderItems: { product: true }, deliveryDetails: true, user: true },
    });
  }
}
