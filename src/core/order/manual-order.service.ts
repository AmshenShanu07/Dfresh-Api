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
  UserTypes,
} from 'src/common/enums';
import { normalisePhone } from 'src/common/utils/phone';
import {
  pickCatalogPrice,
  resolveManualLine,
  manualOrderTotal,
} from './manual-order.util';
import { CreateManualOrderDto } from './dto/create-manual-order.dto';

export type ManualPickerVariant = {
  id: string;
  weight: number;
  unit: string;
  cleaningCharge: number;
  /** Prefill for the form's price box; null when never catalogued. */
  catalogPrice: number | null;
  /** `id` is the CuttingStyle master id, matching OrderItems.cuttingOption. */
  cuttingStyles: { id: string; name: string; price: number }[];
};

export type ManualPickerProduct = {
  id: string;
  name: string;
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
  ) {}

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
    const products = await this.productRepository.find({
      where: { isDeleted: false, variants: { isDeleted: false } },
      relations: {
        category: true,
        variants: { cuttingStyles: { cuttingStyle: true } },
      },
      order: { name: 'ASC' },
    });

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
        categoryName: product.category?.name ?? null,
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
              name: s.cuttingStyle?.name ?? '',
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
    let areaId: string | null = null;
    let deliveryAgentId: string | null = null;
    if (dto.areaId) {
      const area = await this.areaService.findOneActive(dto.areaId);
      if (!area || area.wardId !== dto.wardId) {
        throw new BadRequestException(
          'Select an active area belonging to the chosen ward.',
        );
      }
      areaId = area.id;
      deliveryAgentId = area.userId;
    }

    const variantIds = dto.items.map((item) => item.variantId);
    const variants = await this.productVariantRepository.find({
      where: { id: In(variantIds), isDeleted: false },
      relations: { cuttingStyles: true },
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
}
