import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { ProductVariant } from '../product/entities/product-variant.entity';
import { Products } from '../product/entities/product.entity';
import { ShareCatalogProducts } from '../share-catlaog/entities/share-catalog-products.entity';
import { Ward } from '../ward/entities/ward.entity';
import { AreaService } from '../area/area.service';
import { OrderService } from './order.service';
import { OutletStockService } from '../outlet-stock/outlet-stock.service';
import { localize } from 'src/common/utils/localized-text';
import {
  OrderDetails,
  OrderItems,
  DeliveryDetails,
} from './entities/order.entity';
import {
  MeasurementType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  UserLanguage,
  UserTypes,
} from 'src/common/enums';
import { normalisePhone } from 'src/common/utils/phone';
import {
  pickCatalogPrice,
  resolveManualLine,
  manualOrderTotal,
} from './manual-order.util';
import { CreateManualOrderDto } from './dto/create-manual-order.dto';
import { LocalizedText } from 'src/common/utils/localized-text';

export type ManualPickerVariant = {
  id: string;
  weight: number;
  unit: string;
  cleaningCharge: number;
  /** Prefill for the form's price box; null when never catalogued. */
  catalogPrice: number | null;
  /** `id` is the CuttingStyle master id, matching OrderItems.cuttingOption. */
  cuttingStyles: { id: string; name: LocalizedText; price: number }[];
};

export type ManualPickerProduct = {
  id: string;
  name: LocalizedText;
  categoryName: string | null;
  measurementType: MeasurementType;
  cleaning: boolean;
  /** Master stock in the product's base unit — what the form warns against. */
  totalQuantity: number;
  variants: ManualPickerVariant[];
};

/**
 * Manual (admin-entered) orders. Kept out of OrderService, which is already
 * long and owns the WhatsApp-driven lifecycle; this collapses that lifecycle's
 * several steps into one call for staff taking an order by phone.
 */
@Injectable()
export class ManualOrderService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ProductVariant)
    private readonly productVariantRepository: Repository<ProductVariant>,
    @InjectRepository(Products)
    private readonly productRepository: Repository<Products>,
    @InjectRepository(ShareCatalogProducts)
    private readonly shareCatalogProductsRepository: Repository<ShareCatalogProducts>,
    @InjectRepository(Ward)
    private readonly wardRepository: Repository<Ward>,
    private readonly areaService: AreaService,
    private readonly orderService: OrderService,
    private readonly outletStockService: OutletStockService,
  ) {}

  /**
   * Selling outlets for a ward with their current stock, for the manual-order
   * form's outlet selector (shown when there are two or more) and its
   * per-outlet stock warnings. `stock` maps productId → base-unit amount.
   */
  async getWardOutlets(wardId: string) {
    const outlets = await this.orderService.findSellingOutletsForWard(wardId);
    return Promise.all(
      outlets.map(async (o) => ({
        id: o.id,
        name: o.name,
        stock: Object.fromEntries(
          await this.outletStockService.getStockMap(o.id),
        ),
      })),
    );
  }

  /**
   * The outlet a manual order is fulfilled from: the ward's only selling
   * outlet, or the one staff picked when there are several. Null when no
   * outlet sells into the ward (stock is then taken from the master only).
   */
  private async resolveOutletId(
    dto: CreateManualOrderDto,
  ): Promise<string | null> {
    const outlets = await this.orderService.findSellingOutletsForWard(
      dto.wardId,
    );
    if (dto.outletId && !outlets.some((o) => o.id === dto.outletId)) {
      throw new BadRequestException(
        'Select an outlet that sells in the chosen ward.',
      );
    }
    if (outlets.length === 0) return null;
    if (outlets.length === 1) return outlets[0].id;
    if (!dto.outletId) {
      throw new BadRequestException(
        'This ward is served by more than one outlet. Select the outlet to fulfil the order from.',
      );
    }
    return dto.outletId;
  }

  /**
   * Everything the manual-order product picker needs, in one call: each
   * non-deleted product with its non-deleted variants, their cleaning charge,
   * cutting styles with prices, catalog price prefill and master stock.
   *
   * Variants are filtered on `isDeleted` only. `isActive` is owned by the
   * share-catalog cron — it is false whenever no catalog is live — so
   * filtering on it would empty this list at exactly the times manual orders
   * exist to serve.
   */
  async getPickerProducts(): Promise<ManualPickerProduct[]> {
    // `name` is jsonb — ordering on it via `find()`'s `order` option would sort
    // by its raw JSON representation, so the fetched rows are sorted in JS by
    // their English name instead.
    const products = await this.productRepository.find({
      where: { isDeleted: false, variants: { isDeleted: false } },
      relations: {
        category: true,
        variants: { cuttingStyles: { cuttingStyle: true } },
      },
    });
    products.sort((a, b) => a.name.en.localeCompare(b.name.en));

    const catalogEntries = await this.shareCatalogProductsRepository.find({
      relations: { shareCatalog: true },
    });
    const entriesByVariant = new Map<string, any[]>();
    for (const entry of catalogEntries) {
      if (!entry.variantId) continue;
      const list = entriesByVariant.get(entry.variantId) ?? [];
      list.push(entry);
      entriesByVariant.set(entry.variantId, list);
    }

    return products
      .map((product: any) => ({
        id: product.id,
        name: product.name,
        categoryName: product.category?.name?.en ?? null,
        measurementType: product.measurementType,
        cleaning: product.cleaning,
        totalQuantity: product.totalQuantity,
        variants: (product.variants ?? []).map((variant: any) => ({
          id: variant.id,
          weight: variant.weight,
          unit: variant.unit,
          cleaningCharge: variant.cleaningCharge,
          catalogPrice: pickCatalogPrice(entriesByVariant.get(variant.id) ?? []),
          cuttingStyles: (variant.cuttingStyles ?? [])
            .filter((s: any) => !s.isDeleted)
            .map((s: any) => ({
              id: s.cuttingStyleId,
              name: s.cuttingStyle?.name ?? { en: '', ml: '' },
              price: s.price,
            })),
        })),
      }))
      // A product whose every variant is deleted comes back with an empty
      // array and would render as an unselectable row.
      .filter((product) => product.variants.length > 0);
  }

  /**
   * Creates an admin-entered order, collapsing into one call what the WhatsApp
   * flow spreads across cart checkout, address capture and payment selection.
   *
   * Everything that can be rejected is validated before the transaction opens,
   * so the transaction body only writes. Stock deduction and the bill send
   * happen after the commit: both are idempotent and neither should be able to
   * roll back a legitimately placed order.
   */
  async create(dto: CreateManualOrderDto): Promise<{ orderId: string }> {
    const phone = normalisePhone(dto.phone);
    if (!phone) {
      throw new BadRequestException('A valid customer phone number is required.');
    }

    const ward = await this.wardRepository.findOne({
      where: { id: dto.wardId },
    });
    if (!ward) {
      throw new BadRequestException('Select a valid ward.');
    }

    // An area is optional — not every ward has them configured, and the
    // WhatsApp flow already tolerates that by leaving the agent unassigned for
    // dispatch-time picking. But an area that IS supplied must be active and
    // belong to the chosen ward, or the order would route to an agent who does
    // not serve the address.
    const outletId = await this.resolveOutletId(dto);

    let areaId: string | null = null;
    let deliveryAgentId: string | null = null;
    if (dto.areaId) {
      const area = await this.areaService.findOneActive(dto.areaId);
      if (!area || area.wardId !== dto.wardId) {
        throw new BadRequestException(
          'Select an active area belonging to the chosen ward.',
        );
      }
      // The area's agent delivers; they must belong to the outlet whose stock
      // is used.
      if (outletId && area.outletId !== outletId) {
        throw new BadRequestException(
          'Select an area served by the chosen outlet.',
        );
      }
      areaId = area.id;
      deliveryAgentId = area.userId;
    }

    const variantIds = dto.items.map((item) => item.variantId);
    const variants = await this.productVariantRepository.find({
      where: { id: In(variantIds), isDeleted: false },
      relations: { cuttingStyles: true, product: true },
    });
    const variantById = new Map(variants.map((v: any) => [v.id, v]));

    const lines = dto.items.map((item) => {
      const variant = variantById.get(item.variantId);
      if (!variant) {
        throw new BadRequestException(
          `Product variant ${item.variantId} is unavailable.`,
        );
      }
      return resolveManualLine(variant, item);
    });

    if (outletId) {
      await this.assertOutletCanCover(outletId, dto.items, variantById);
    }

    const totalAmount = manualOrderTotal(lines);
    // UPI is VERIFIED rather than awaiting anything: staff only record a manual
    // UPI order once the money has landed, so there is no screenshot round trip.
    const paymentStatus =
      dto.paymentMethod === PaymentMethod.UPI
        ? PaymentStatus.VERIFIED
        : PaymentStatus.NOT_REQUIRED;

    const orderId = await this.dataSource.transaction(async (manager) => {
      let user = await manager.findOne(User, { where: { phone } });
      if (!user) {
        if (!dto.customerName?.trim()) {
          throw new BadRequestException(
            'A customer name is required for a new customer.',
          );
        }
        // Two-argument save(Entity, row) throughout this transaction, not
        // save(row): the entity class is what tells TypeORM which table to
        // write when the row is a plain object.
        user = await manager.save(
          User,
          manager.create(User, {
            name: dto.customerName.trim(),
            phone,
            // Matches the WhatsApp onboarding path, so a customer created here
            // is indistinguishable from one created by the bot.
            password: 'customer-password',
            userType: UserTypes.CUSTOMER,
          }),
        );
      } else if (user.userType !== UserTypes.CUSTOMER) {
        throw new BadRequestException(
          'That phone number belongs to a staff or supplier account.',
        );
      }

      const order = await manager.save(
        OrderDetails,
        manager.create(OrderDetails, {
          userId: user.id,
          totalAmount,
          status: OrderStatus.CONFIRMED,
          paymentMethod: dto.paymentMethod,
          paymentStatus,
          wardId: dto.wardId,
          areaId,
          deliveryAgentId,
          outletId,
        }),
      );

      await manager.save(
        OrderItems,
        lines.map((line) =>
          manager.create(OrderItems, {
            orderId: order.id,
            productId: line.productId,
            variantId: line.variantId,
            quantity: line.quantity,
            price: line.price,
            totalPrice: line.totalPrice,
            cleaning: line.cleaning,
            cleaningCharge: line.cleaningCharge,
            cutting: line.cutting,
            cuttingOption: line.cuttingOption,
            cuttingCharge: line.cuttingCharge,
          }),
        ),
      );

      // A plain insert, not the upsert OrderService.writeDeliveryDetails uses:
      // this order was created moments ago, so no row can already exist.
      await manager.save(
        DeliveryDetails,
        manager.create(DeliveryDetails, {
          orderId: order.id,
          name: dto.deliveryName,
          phone: normalisePhone(dto.deliveryPhone) || dto.deliveryPhone,
          address: dto.address,
          pinCode: dto.pinCode,
        }),
      );

      return order.id;
    });

    await this.orderService.applyStockDeduction(orderId);

    return { orderId };
  }

  /**
   * Rejects the order when the outlet can't cover a product: the order's total
   * for it (variant amount × quantity, summed across lines) must fit that
   * outlet's stock. Names every short product so staff can fix the lines.
   */
  private async assertOutletCanCover(
    outletId: string,
    items: CreateManualOrderDto['items'],
    variantById: Map<string, any>,
  ) {
    const stock = await this.outletStockService.getStockMap(outletId);
    const needed = new Map<string, { amount: number; name: string }>();
    for (const item of items) {
      const variant = variantById.get(item.variantId);
      const entry = needed.get(variant.productId) ?? {
        amount: 0,
        name: localize(variant.product?.name, UserLanguage.EN) || 'Product',
      };
      entry.amount += (variant.weight ?? 0) * item.quantity;
      needed.set(variant.productId, entry);
    }

    const short = [...needed]
      .filter(([productId, { amount }]) => amount > (stock.get(productId) ?? 0))
      .map(([, { name }]) => name);
    if (short.length) {
      throw new BadRequestException(
        `Out of stock at the selected outlet: ${short.join(', ')}.`,
      );
    }
  }
}
