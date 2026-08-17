import { Injectable } from '@nestjs/common';
import { UpdateOrderDto } from './dto/update-order.dto';
import { InjectRepository } from '@nestjs/typeorm';
import {
  FindOptionsOrder,
  FindOptionsWhere,
  ILike,
  In,
  IsNull,
  Raw,
  Repository,
} from 'typeorm';
import { OrderDetails, OrderItems, DeliveryDetails } from './entities/order.entity';
import { User } from '../users/entities/user.entity';
import { Staff } from '../users/entities/staff.entity';
import { Outlets } from '../outlet/entities/outlet.entity';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
import { OutletStockService } from '../outlet-stock/outlet-stock.service';
import {
  isRangeKey,
  resolveCustomRange,
  resolveRange,
} from 'src/common/utils/date-range';
import { positiveIntOr } from 'src/common/utils/pagination';
import { likeContains } from 'src/common/utils/search';
import { deriveOrderNumber, normaliseOrderNumber } from './order-number.util';

/**
 * Sentinel `outletId` for orders that carry no ward (placed before ward capture
 * existed), so they can be inspected instead of silently vanishing from every
 * outlet-filtered view.
 */
export const UNASSIGNED_OUTLET = 'unassigned';

/**
 * Result of {@link OrderService.selectPaymentMethod}.
 *  - `updated`  — the PENDING order had no payment method yet and accepted
 *                 this one (order returned).
 *  - `locked`   — the order already has a payment method, or is no longer
 *                 PENDING (CONFIRMED/CANCELLED/…), so the tap was ignored and
 *                 the order was left untouched.
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
    private readonly outletStockService: OutletStockService,
  ) {}

  /**
   * Deducts confirmed order quantities (variant weight x qty, in grams) from
   * both the product master stock and the live share-catalog allocation.
   * Idempotent via the OrderDetails.stockDeducted flag. If the live catalog
   * runs out of sellable products, it is auto-paused.
   *
   * Public so ManualOrderService can reuse it after its own transaction commits.
   */
  async applyStockDeduction(orderId: string) {
    const order = await this.orderDetailsRepository.findOne({
      where: { id: orderId },
      relations: { orderItems: { variant: true } },
    });
    if (!order || order.stockDeducted) return;

    // Mark first to guard against concurrent/duplicate confirmations.
    await this.orderDetailsRepository.update(orderId, { stockDeducted: true });

    // Resolve once and persist, so a later restoreStock credits the same
    // outlet even if the order's ward/area or the outlet layout changes.
    const outletId = await this.resolveFulfillingOutletId(order);
    if (outletId) {
      await this.orderDetailsRepository.update(orderId, { outletId });
    }

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

      // Outlet-level ledger: no floor, deliberately allowed to go negative
      // (system-driven consumption, unlike an admin-initiated transfer).
      if (outletId) {
        await this.outletStockService.applyOrderConsumption(
          outletId,
          item.productId,
          grams,
        );
      }

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

      // Credit back the outlet resolved (and persisted) at deduction time —
      // never re-derived, so a later ward/outlet change can't misattribute it.
      if (order.outletId) {
        await this.outletStockService.restoreOrderConsumption(
          order.outletId,
          item.productId,
          grams,
        );
      }

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
    search?: string;
    deliveryAgentId?: string;
  }) {
    // `?? default` is not enough here — an absent numeric @Query arrives as
    // NaN, which is not nullish. See positiveIntOr's comment for the full trap.
    const takeCount = positiveIntOr(filter.count, 10);
    const skipCount = (positiveIntOr(filter.pageNumber, 1) - 1) * takeCount;

    // A comma-separated status list (e.g. "DISPATCHED,DELIVERED", used by the
    // Dispatched Orders page) matches any of the given statuses. Single-status
    // callers are unaffected.
    const statusList = filter.status
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) as OrderStatus[] | undefined;

    const base: FindOptionsWhere<OrderDetails> = {};
    if (statusList?.length === 1) base.status = statusList[0];
    else if (statusList && statusList.length > 1) base.status = In(statusList);
    if (filter.deliveryAgentId) base.deliveryAgentId = filter.deliveryAgentId;

    // Explicit from/to wins over the preset; both go through the IST-aware
    // helpers rather than `new Date(...)`, which would read a yyyy-MM-dd
    // calendar date as UTC midnight and shift the whole window by 5h30 —
    // dropping most of the last day's orders. Invalid dates resolve to null
    // and are ignored rather than silently returning nothing.
    const window =
      resolveCustomRange(filter.from, filter.to) ??
      (isRangeKey(filter.range) ? resolveRange(filter.range) : null);
    if (window) {
      // Half-open [from, to) to match the helpers' contract; `Between` is
      // inclusive at both ends and would leak the next day's first instant.
      base.createdAt = Raw(
        (alias) => `${alias} >= :dfFrom AND ${alias} < :dfTo`,
        { dfFrom: window.from, dfTo: window.to },
      );
    }

    if (filter.outletId === UNASSIGNED_OUTLET) {
      base.wardId = IsNull();
    } else if (filter.outletId) {
      const outlet = await this.outletRepository.findOne({
        where: { id: filter.outletId, isDeleted: false },
      });
      // An outlet serving no ward can have no orders routed to it, so an empty
      // page is the correct answer — not an unfiltered list.
      if (!outlet?.wardId) return { total: 0, data: [] };
      base.wardId = outlet.wardId;
    }

    // One search box spans the order number and the customer. TypeORM's
    // array-of-where form is an OR, so every branch re-spreads `base` to keep
    // the other filters ANDed in — and the same array feeds count() and find()
    // so `total` stays in step with the rows.
    const where = this.buildOrderSearchWhere(base, filter.search);

    // Multi-status callers (Dispatched Orders: "DISPATCHED,DELIVERED") get
    // DISPATCHED rows ahead of DELIVERED ones for free — Postgres orders a
    // native enum column by its declared value order (DISPATCHED precedes
    // DELIVERED in OrderStatus), not alphabetically. Single-status callers are
    // unaffected since every row shares one status.
    const order: FindOptionsOrder<OrderDetails> =
      statusList && statusList.length > 1
        ? { status: 'ASC', createdAt: 'DESC' }
        : { createdAt: 'DESC' };

    const [total, data] = await Promise.all([
      this.orderDetailsRepository.count({ where }),
      this.orderDetailsRepository.find({
        where,
        relations: { user: true, orderItems: true },
        order,
        take: takeCount,
        skip: skipCount,
      }),
    ]);

    // Derived here rather than in the client so the list shows the same number
    // as the bill, the product label and the WhatsApp confirmation — all of
    // which already go through deriveOrderNumber.
    return {
      total,
      data: data.map((order) => ({
        ...order,
        orderNumber: deriveOrderNumber(order),
      })),
    };
  }

  /**
   * Expands `base` into the OR-branches a search term needs, or returns it
   * untouched when there is nothing to search for.
   *
   * The order number is matched by comparing the normalised (digits-only, no
   * leading zeros) term against `orderSeq`. A term that normalises to nothing
   * (e.g. `"DF-260727-"`) drops that branch entirely — otherwise its `%%`
   * pattern would match every order.
   */
  private buildOrderSearchWhere(
    base: FindOptionsWhere<OrderDetails>,
    search?: string,
  ): FindOptionsWhere<OrderDetails> | FindOptionsWhere<OrderDetails>[] {
    const term = search?.trim();
    if (!term) return base;

    const branches: FindOptionsWhere<OrderDetails>[] = [
      { ...base, user: { name: ILike(likeContains(term)) } },
      { ...base, user: { phone: ILike(likeContains(term)) } },
    ];

    const orderNumber = normaliseOrderNumber(term);
    if (orderNumber) {
      branches.unshift({
        ...base,
        // CAST(... AS text) rather than `::text`: TypeORM's property-name
        // rewriting does not understand the `::` operator and strips the
        // quotes off the alias, leaving `OrderDetails.orderSeq` — which
        // Postgres folds to `orderdetails` and then cannot find in the FROM
        // clause.
        orderSeq: Raw((alias) => `CAST(${alias} AS text) ILIKE :dfOrderNo`, {
          dfOrderNo: likeContains(orderNumber),
        }),
      });
    }

    return branches;
  }

  async findOne(id: string) {
    const order = await this.orderDetailsRepository.findOne({
      where: { id },
      relations: {
        user: true,
        deliveryAgent: true,
        orderItems: { product: { category: true }, variant: true },
        deliveryDetails: true,
      },
    });
    if (!order) return null;

    // Same convention as findAll: attach the display order number so every
    // consumer of a single order (detail page, dashboard table) can show it
    // without recomputing it independently — that independent recomputation
    // (order.id.slice(0, 8)) is exactly what produced a different-looking
    // number than the bill/WhatsApp messages on the frontend.
    return { ...order, orderNumber: deriveOrderNumber(order) };
  }

  /**
   * Resolves the outlet that fulfills an order: the area's owning outlet
   * (Area.outletId) when the order has an areaId, else the first outlet
   * serving the order's ward (Outlets.wardId) — the same "oldest outlet"
   * fallback used before areas existed. Null when neither resolves (no ward
   * captured, or the ward maps to no outlet). Two outlets sharing a ward with
   * no area selected are still indistinguishable here — that ambiguity is
   * unchanged by this helper, only the resolution point is now shared.
   */
  private async resolveFulfillingOutletId(order: {
    areaId?: string | null;
    wardId?: string | null;
  }): Promise<string | null> {
    if (order.areaId) {
      const area = await this.areaService.findOneActive(order.areaId);
      if (area?.outletId) return area.outletId;
    }
    if (!order.wardId) return null;

    const outlet = await this.outletRepository.findOne({
      where: { wardId: order.wardId, isDeleted: false },
      order: { createdAt: 'ASC' },
    });
    return outlet?.id ?? null;
  }

  /**
   * Resolves the delivery agents available for an order, via the order's
   * fulfilling outlet (see resolveFulfillingOutletId). Agents are the
   * outlet's Staff whose user is an OUTLET_AGENT. Returns the resolved
   * outletId (null when none) and the agent list ([] when no outlet resolves
   * or the outlet has none).
   */
  async getDeliveryAgentsForOrder(orderId: string) {
    const order = await this.orderDetailsRepository.findOne({
      where: { id: orderId },
    });
    if (!order) {
      return { outletId: null, agents: [] };
    }

    const outletId = await this.resolveFulfillingOutletId(order);
    if (!outletId) {
      return { outletId: null, agents: [] };
    }

    const staff = await this.staffRepository.find({
      where: { outletId, isDeleted: false },
      relations: { user: true },
    });

    const agents = staff
      .filter((s) => s.user?.userType === UserTypes.OUTLET_AGENT)
      .map((s) => ({
        id: s.user.id,
        name: s.user.name,
        phone: s.user.phone,
      }));

    return { outletId, agents };
  }

  /**
   * Generates and stores this order's delivery-confirmation OTP the first
   * time it's called for a given order; a no-op afterwards. Called from every
   * CONFIRMED-transition path so the code exists as soon as an order is
   * confirmed, regardless of which path got it there — a retried/duplicate
   * confirm on an already-CONFIRMED order must not rotate a code that may
   * already have been read out to the customer.
   */
  private async ensureDeliveryOtp(orderId: string) {
    const existing = await this.orderDetailsRepository.findOne({
      where: { id: orderId },
      select: { id: true, deliveryOtp: true },
    });
    if (existing?.deliveryOtp) return;

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await this.orderDetailsRepository.update(orderId, {
      deliveryOtp: otp,
      deliveryOtpGeneratedAt: new Date(),
    });
  }

  async confirmOrder(id: string) {
    await this.orderDetailsRepository.update(id, { status: OrderStatus.CONFIRMED });
    await this.applyStockDeduction(id);
    await this.ensureDeliveryOtp(id);
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
   * status and delivery agent. Returns the fully-loaded order plus a
   * `statusChanged` flag so the caller can decide whether to notify the
   * customer.
   */
  async updateOrderDetails(
    id: string,
    dto: {
      status?: OrderStatus;
      deliveryAgentId?: string;
    },
  ) {
    const existing = await this.orderDetailsRepository.findOne({
      where: { id },
      relations: { user: true, deliveryDetails: true },
    });
    if (!existing) return null;

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
        await this.ensureDeliveryOtp(id);
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
    data: {
      address: string;
      pinCode?: string;
      landmark?: string;
      phone: string;
      name: string;
    },
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
        landmark: addressData.landmark,
        pinCode: addressData.pinCode,
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
      landmark: string;
      pinCode?: string;
      phone: string;
      wardId?: string | null;
      areaId?: string | null;
    },
  ) {
    try {
      await this.writeDeliveryDetails(orderId, {
        address: address.address,
        landmark: address.landmark,
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
    // A payment method, once chosen, is final — even while the order is
    // still PENDING (e.g. UPI selected and awaiting the screenshot). Without
    // this, a stale/second button tap could silently switch COD <-> UPI.
    if (existing.status !== OrderStatus.PENDING || existing.paymentMethod !== null) {
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
      await this.ensureDeliveryOtp(orderId);
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
    await this.ensureDeliveryOtp(orderId);

    return this.orderDetailsRepository.findOne({
      where: { id: orderId },
      relations: {
        orderItems: { product: true, variant: true },
        deliveryDetails: true,
        user: true,
      },
    });
  }

  /**
   * Validates that `requestingUser` may act on this order's delivery OTP —
   * either they're the assigned delivery agent, or an ADMIN acting as a
   * support fallback — and that the order has been DISPATCHED (an agent
   * assigned, out for delivery) but not yet DELIVERED/CANCELLED. Returns the
   * order with the relations the caller needs to send the OTP (customer
   * phone, order number derivation).
   */
  private async loadOrderForDeliveryOtp(
    orderId: string,
    requestingUser: { id: string; userType: UserTypes },
  ) {
    const order = await this.orderDetailsRepository.findOne({
      where: { id: orderId },
      relations: { user: true, deliveryDetails: true },
    });
    if (!order) throw new BadRequestException('Order not found');
    if (order.status !== OrderStatus.DISPATCHED) {
      throw new BadRequestException(
        'Order must be DISPATCHED to send or verify a delivery OTP',
      );
    }
    const isOwningAgent = order.deliveryAgentId === requestingUser.id;
    const isAdmin = requestingUser.userType === UserTypes.ADMIN;
    if (!isOwningAgent && !isAdmin) {
      throw new ForbiddenException(
        'You are not the delivery agent assigned to this order',
      );
    }
    return order;
  }

  /**
   * Loads the order for an OTP send, generating the code on the fly as a
   * fallback for orders confirmed before this feature existed (deliveryOtp
   * would otherwise be null forever).
   */
  async getOrderForDeliveryOtp(
    orderId: string,
    requestingUser: { id: string; userType: UserTypes },
  ) {
    const order = await this.loadOrderForDeliveryOtp(orderId, requestingUser);
    if (!order.deliveryOtp) {
      await this.ensureDeliveryOtp(orderId);
      return this.loadOrderForDeliveryOtp(orderId, requestingUser);
    }
    return order;
  }

  async markDeliveryOtpSent(orderId: string) {
    await this.orderDetailsRepository.update(orderId, {
      deliveryOtpSentAt: new Date(),
    });
  }

  async verifyDeliveryOtp(
    orderId: string,
    requestingUser: { id: string; userType: UserTypes },
    code: string,
  ) {
    const order = await this.loadOrderForDeliveryOtp(orderId, requestingUser);

    if (!order.deliveryOtp || order.deliveryOtp !== code?.trim()) {
      return { success: false, message: 'Incorrect OTP' };
    }

    await this.orderDetailsRepository.update(orderId, {
      status: OrderStatus.DELIVERED,
      deliveredAt: new Date(),
    });

    return { success: true, order: await this.findOne(orderId) };
  }
}
