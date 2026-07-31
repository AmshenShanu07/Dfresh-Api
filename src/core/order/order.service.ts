import { Injectable } from '@nestjs/common';
import { UpdateOrderDto } from './dto/update-order.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, Repository } from 'typeorm';
import { OrderDetails, OrderItems, DeliveryDetails } from './entities/order.entity';
import { User } from '../users/entities/user.entity';
import { Staff } from '../users/entities/staff.entity';
import { Outlets } from '../outlet/entities/outlet.entity';
import { BadRequestException } from '@nestjs/common';
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
import { AreaService } from '../area/area.service';
import { isRangeKey, resolveRange } from 'src/common/utils/date-range';
import { positiveIntOr } from 'src/common/utils/pagination';

/**
 * Sentinel `outletId` for orders that carry no ward (placed before ward capture
 * existed), so they can be inspected instead of silently vanishing from every
 * outlet-filtered view.
 */
export const UNASSIGNED_OUTLET = 'unassigned';

/**
 * Result of {@link OrderService.selectPaymentMethod}.
 *  - `updated`  — the PENDING order accepted the method (order returned).
 *  - `locked`   — the order is no longer PENDING (CONFIRMED/CANCELLED/…), so
 *                 the payment method was left untouched.
 *  - `not_found`— no order with that id.
 */
export type SelectPaymentResult =
  | { outcome: 'updated'; order: OrderDetails | null }
  | { outcome: 'locked'; order: OrderDetails }
  | { outcome: 'not_found' };

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
    @InjectRepository(Outlets)
    private readonly outletRepository: Repository<Outlets>,
    @InjectRepository(Staff)
    private readonly staffRepository: Repository<Staff>,
    private readonly areaService: AreaService,
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

    // Remember which catalog the stock was taken from so a later cancel /
    // expiry can credit the correct catalog even if a different one is LIVE then.
    if (live) {
      await this.orderDetailsRepository.update(orderId, {
        stockCatalogId: live.id,
      });
    }

    for (const item of order.orderItems ?? []) {
      const weight = item.variant?.weight ?? 0;
      const grams = weight * (item.quantity ?? 0);
      if (grams <= 0) continue;

      await this.productRepository
        .createQueryBuilder()
        .update(Products)
        .set({ totalQuantity: () => 'GREATEST(0, "totalQuantity" - :grams)' })
        .where('id = :id', { id: item.productId })
        .setParameters({ grams })
        .execute();

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

  /**
   * Reverses a prior stock deduction/reservation: credits the reserved
   * quantities back to the product master stock and, when known, to the
   * originating share-catalog allocation. Idempotent via the stockDeducted
   * flag (cleared after crediting). Does NOT resume a PAUSED catalog.
   */
  private async restoreStock(orderId: string) {
    const order = await this.orderDetailsRepository.findOne({
      where: { id: orderId },
      relations: { orderItems: { variant: true } },
    });
    if (!order || !order.stockDeducted) return;

    // Clear first to guard against concurrent/duplicate restores.
    await this.orderDetailsRepository.update(orderId, { stockDeducted: false });

    const catalog = order.stockCatalogId
      ? await this.shareCatalogRepository.findOne({
          where: { id: order.stockCatalogId },
          relations: { ShareCatalogProductStock: true },
        })
      : null;

    for (const item of order.orderItems ?? []) {
      const weight = item.variant?.weight ?? 0;
      const grams = weight * (item.quantity ?? 0);
      if (grams <= 0) continue;

      await this.productRepository.increment(
        { id: item.productId },
        'totalQuantity',
        grams,
      );

      if (catalog) {
        const stock = (catalog.ShareCatalogProductStock ?? []).find(
          (s: any) => s.productId === item.productId,
        );
        if (stock) {
          stock.remainingGrams = Math.min(
            stock.offeredGrams,
            stock.remainingGrams + grams,
          );
          await this.shareCatalogProductStockRepository.save(stock);
        }
      }
    }
  }

  /**
   * Cancels and releases stock for stale unconfirmed orders. Runs on a cron.
   * Skips UPI orders awaiting payment/verification (they keep status PENDING
   * but must be settled by an admin, not auto-cancelled).
   */
  async expireStaleOrders(maxAgeMinutes = 30) {
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

    const stale = await this.orderDetailsRepository
      .createQueryBuilder('order')
      .where('order.status IN (:...statuses)', {
        statuses: [OrderStatus.DRAFT, OrderStatus.PENDING],
      })
      .andWhere('order.createdAt < :cutoff', { cutoff })
      .andWhere('order.paymentStatus NOT IN (:...pending)', {
        pending: [
          PaymentStatus.AWAITING_SCREENSHOT,
          PaymentStatus.AWAITING_VERIFICATION,
        ],
      })
      .getMany();

    for (const order of stale) {
      await this.restoreStock(order.id);
      await this.orderDetailsRepository.update(order.id, {
        status: OrderStatus.CANCELLED,
      });
    }

    return { cancelled: stale.length };
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

      // Reserve stock at checkout so the DRAFT→CONFIRMED window can't oversell.
      // Idempotent via stockDeducted, so later confirm-time calls are no-ops.
      await this.applyStockDeduction(order.id);

      return order;
    } catch (error) {
      console.log('error', error);
    }
  }

  /**
   * Paginated order list. Every filter is optional, so callers that pass only
   * pageNumber/count/status behave exactly as before.
   *
   * Date filtering accepts either a preset `range` key (resolved to IST day
   * boundaries) or explicit `from`/`to` instants, which take precedence.
   *
   * `outletId` filters by the ward the outlet serves: orders carry no outletId,
   * only the customer's selected wardId, and outlets map to wards via
   * Outlets.wardId (the same derivation getDeliveryAgentsForOrder uses). Ward
   * is therefore the finest fidelity available — two outlets sharing a ward are
   * indistinguishable here. The sentinel `'unassigned'` selects orders placed
   * before ward capture existed (wardId IS NULL).
   */
  async findAll(filter: {
    pageNumber?: number;
    count?: number;
    status?: string;
    range?: string;
    from?: string;
    to?: string;
    outletId?: string;
  }) {
    // `?? default` is not enough here — an absent numeric @Query arrives as
    // NaN, which is not nullish. See positiveIntOr's comment for the full trap.
    const takeCount = positiveIntOr(filter.count, 10);
    const skipCount = (positiveIntOr(filter.pageNumber, 1) - 1) * takeCount;

    const where: any = {};
    if (filter.status) where.status = filter.status;

    // Explicit from/to wins over the preset; invalid dates are ignored rather
    // than silently returning nothing.
    const explicitFrom = filter.from ? new Date(filter.from) : null;
    const explicitTo = filter.to ? new Date(filter.to) : null;
    if (
      explicitFrom &&
      explicitTo &&
      !isNaN(explicitFrom.getTime()) &&
      !isNaN(explicitTo.getTime())
    ) {
      where.createdAt = Between(explicitFrom, explicitTo);
    } else if (isRangeKey(filter.range)) {
      const { from, to } = resolveRange(filter.range);
      where.createdAt = Between(from, to);
    }

    if (filter.outletId === UNASSIGNED_OUTLET) {
      where.wardId = IsNull();
    } else if (filter.outletId) {
      const outlet = await this.outletRepository.findOne({
        where: { id: filter.outletId, isDeleted: false },
      });
      // An outlet serving no ward can have no orders routed to it, so an empty
      // page is the correct answer — not an unfiltered list.
      if (!outlet?.wardId) return { total: 0, data: [] };
      where.wardId = outlet.wardId;
    }

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
        deliveryAgent: true,
        orderItems: { product: { category: true }, variant: true },
        deliveryDetails: true,
      },
    });
  }

  /**
   * Resolves the delivery agents available for an order. The order's outlet is
   * derived from the customer's selected ward: the first outlet serving that
   * ward (Outlets.wardId). Agents are the outlet's Staff whose user is an
   * OUTLET_AGENT. Returns the resolved outletId (null when none) and the
   * agent list ([] when the ward maps to no outlet or the outlet has none).
   */
  async getDeliveryAgentsForOrder(orderId: string) {
    const order = await this.orderDetailsRepository.findOne({
      where: { id: orderId },
    });
    if (!order || !order.wardId) {
      return { outletId: null, agents: [] };
    }

    const outlet = await this.outletRepository.findOne({
      where: { wardId: order.wardId, isDeleted: false },
      order: { createdAt: 'ASC' },
    });
    if (!outlet) {
      return { outletId: null, agents: [] };
    }

    const staff = await this.staffRepository.find({
      where: { outletId: outlet.id, isDeleted: false },
      relations: { user: true },
    });

    const agents = staff
      .filter((s) => s.user?.userType === UserTypes.OUTLET_AGENT)
      .map((s) => ({
        id: s.user.id,
        name: s.user.name,
        phone: s.user.phone,
      }));

    return { outletId: outlet.id, agents };
  }

  async confirmOrder(id: string) {
    await this.orderDetailsRepository.update(id, { status: OrderStatus.CONFIRMED });
    await this.applyStockDeduction(id);
    return { success: true };
  }

  /**
   * Stamps when the customer bill PDF was sent over WhatsApp. Idempotency for
   * the send itself is enforced by the caller (WhatsappService.sendOrderBill)
   * checking billSentAt before sending; this just records the timestamp.
   */
  async markBillSent(id: string) {
    await this.orderDetailsRepository.update(id, { billSentAt: new Date() });
  }

  async cancelOrder(id: string) {
    // Credit any reserved/deducted stock back before cancelling.
    await this.restoreStock(id);
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
      deliveryAgentId?: string;
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

    // A delivery agent from the order's outlet must be assigned before the
    // order can move to DISPATCHED. Validate against the derived agent list so
    // the assignment can't be spoofed to an agent of another outlet.
    if (statusChanged && dto.status === OrderStatus.DISPATCHED) {
      const { agents } = await this.getDeliveryAgentsForOrder(id);
      if (agents.length === 0) {
        throw new BadRequestException(
          'No delivery agent is available for this order\'s area. Assign an agent to the serving outlet before dispatching.',
        );
      }
      const chosen = agents.find((a) => a.id === dto.deliveryAgentId);
      if (!chosen) {
        throw new BadRequestException(
          'Select a valid delivery agent from the order\'s outlet before dispatching.',
        );
      }
      await this.orderDetailsRepository.update(id, {
        deliveryAgentId: chosen.id,
      });
    }

    if (statusChanged) {
      await this.orderDetailsRepository.update(id, { status: dto.status });
      if (dto.status === OrderStatus.CONFIRMED) {
        await this.applyStockDeduction(id);
      }
    }

    const order = await this.findOne(id);
    return { order, statusChanged };
  }

  /**
   * Writes the single delivery address for an order. `DeliveryDetails.orderId`
   * is unique (one-to-one with the order), so this must be idempotent: if the
   * customer re-submits an address for the same order (e.g. taps "Add New
   * Address"/"Confirm Address" more than once), overwrite the existing row
   * instead of inserting a duplicate — a blind insert violates the unique
   * constraint and silently stalls the WhatsApp checkout flow.
   */
  private async writeDeliveryDetails(
    orderId: string,
    data: { address: string; pinCode: string; phone: string; name: string },
  ) {
    await this.deliveryDetailsRepository.upsert(
      { orderId, ...data },
      ['orderId'],
    );
  }

  /**
   * Resolves an Area selection into the columns to persist. `areaId` is
   * always captured for reference; `deliveryAgentId` is only set when the
   * area is currently active, auto-routing the order to that area's owning
   * agent immediately rather than waiting for dispatch-time manual picking.
   * Returns `{}` when no area was selected (ward-only checkout, unchanged
   * fallback behavior).
   */
  private async resolveAreaAssignment(areaId?: string | null) {
    if (!areaId) return {};
    const area = await this.areaService.findOneActive(areaId);
    if (!area) return { areaId };
    return { areaId: area.id, deliveryAgentId: area.userId };
  }

  async updateOrderAddress(addressData: any) {
    try {
      await this.writeDeliveryDetails(addressData.flow_token, {
        address: addressData.address,
        pinCode: addressData.pincode,
        phone: addressData.phone,
        name: addressData.name,
      });

      const areaAssignment = await this.resolveAreaAssignment(
        addressData.areaId,
      );

      await this.orderDetailsRepository.update(addressData.flow_token, {
        status: OrderStatus.PENDING,
        // Capture the selected ward so the serving outlet can be derived when
        // assigning a delivery agent at dispatch. Only overwrite when provided.
        ...(addressData.wardId ? { wardId: addressData.wardId } : {}),
        ...areaAssignment,
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
    address: {
      name: string;
      address: string;
      pinCode: string;
      phone: string;
      wardId?: string | null;
      areaId?: string | null;
    },
  ) {
    try {
      await this.writeDeliveryDetails(orderId, {
        address: address.address,
        pinCode: address.pinCode,
        phone: address.phone,
        name: address.name,
      });

      const areaAssignment = await this.resolveAreaAssignment(address.areaId);

      await this.orderDetailsRepository.update(orderId, {
        status: OrderStatus.PENDING,
        // Capture the selected ward so the serving outlet can be derived when
        // assigning a delivery agent at dispatch. Only overwrite when provided.
        ...(address.wardId ? { wardId: address.wardId } : {}),
        ...areaAssignment,
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

  /**
   * Records the customer's chosen payment method for an order.
   *
   * Only a PENDING order may change payment method — that is the single state
   * in which the WhatsApp payment buttons are legitimately outstanding. The
   * buttons stay in the chat history forever, so a customer can re-tap them
   * after the order has moved on; without this guard a tap would silently flip
   * the method and re-run confirmation. Blocked cases:
   *  - CONFIRMED (COD chosen, or UPI paid + admin-verified) → already final.
   *  - CANCELLED (e.g. auto-expired) → a stale tap must not revive it.
   * UPI↔COD switching while the order is still PENDING (awaiting screenshot /
   * verification) remains allowed.
   */
  async selectPaymentMethod(
    orderId: string,
    method: PaymentMethod,
  ): Promise<SelectPaymentResult> {
    const existing = await this.orderDetailsRepository.findOne({
      where: { id: orderId },
    });
    if (!existing) return { outcome: 'not_found' };
    if (existing.status !== OrderStatus.PENDING) {
      return { outcome: 'locked', order: existing };
    }

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

    const order = await this.orderDetailsRepository.findOne({
      where: { id: orderId },
      relations: { orderItems: { product: true }, deliveryDetails: true },
    });
    return { outcome: 'updated', order };
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
      relations: {
        orderItems: { product: true, variant: true },
        deliveryDetails: true,
        user: true,
      },
    });
  }
}
