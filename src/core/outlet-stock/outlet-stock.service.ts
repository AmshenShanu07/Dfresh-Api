import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { OutletProductStock } from './entities/outlet-product-stock.entity';
import { StockTransfer } from './entities/stock-transfer.entity';
import { Products } from '../product/entities/product.entity';
import { Outlets } from '../outlet/entities/outlet.entity';
import { ProductUnits } from 'src/common/enums';
import { formatAmount, toBase } from 'src/common/utils/units';

export type TransferStockInput = {
  productId: string;
  fromOutletId: string;
  toOutletId: string;
  quantity: number;
  quantityUnit: ProductUnits;
};

export type ListTransfersFilter = {
  outletId?: string;
  productId?: string;
  page?: number;
  limit?: number;
};

@Injectable()
export class OutletStockService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(OutletProductStock)
    private readonly outletProductStockRepository: Repository<OutletProductStock>,
    @InjectRepository(StockTransfer)
    private readonly stockTransferRepository: Repository<StockTransfer>,
    @InjectRepository(Products)
    private readonly productRepository: Repository<Products>,
    @InjectRepository(Outlets)
    private readonly outletRepository: Repository<Outlets>,
  ) {}

  /** All active outlets x all active products, with current stock (0 where no row exists). */
  async getGrid() {
    const [outlets, products, stocks] = await Promise.all([
      this.outletRepository.find({ where: { isDeleted: false } }),
      this.productRepository.find({ where: { isDeleted: false } }),
      this.outletProductStockRepository.find(),
    ]);

    return {
      outlets: outlets.map((o) => ({ id: o.id, name: o.name })),
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        measurementType: p.measurementType,
        stocks: outlets.map((o) => {
          const row = stocks.find(
            (s) => s.outletId === o.id && s.productId === p.id,
          );
          const quantity = row?.quantity ?? 0;
          return {
            outletId: o.id,
            quantity,
            formatted: formatAmount(quantity, p.measurementType),
          };
        }),
      })),
    };
  }

  /** Blocking, admin-initiated move: fails outright if the source can't cover it. */
  async transfer(input: TransferStockInput, actingUserId: string) {
    if (input.fromOutletId === input.toOutletId) {
      throw new BadRequestException(
        'Source and destination outlet must be different',
      );
    }
    if (!(input.quantity > 0)) {
      throw new BadRequestException('Quantity must be greater than zero');
    }

    return this.dataSource.transaction(async (manager) => {
      const baseQty = toBase(input.quantity, input.quantityUnit);

      const source = await manager.findOne(OutletProductStock, {
        where: { outletId: input.fromOutletId, productId: input.productId },
      });
      const available = source?.quantity ?? 0;
      if (available < baseQty) {
        throw new BadRequestException(
          'Source outlet does not have enough stock for this transfer',
        );
      }
      await manager.save(OutletProductStock, {
        ...source,
        quantity: available - baseQty,
      });

      const destination = await manager.findOne(OutletProductStock, {
        where: { outletId: input.toOutletId, productId: input.productId },
      });
      await manager.save(OutletProductStock, {
        ...destination,
        outletId: input.toOutletId,
        productId: input.productId,
        quantity: (destination?.quantity ?? 0) + baseQty,
      });

      return manager.save(StockTransfer, {
        productId: input.productId,
        fromOutletId: input.fromOutletId,
        toOutletId: input.toOutletId,
        quantity: input.quantity,
        quantityUnit: input.quantityUnit,
        movedByUserId: actingUserId,
      });
    });
  }

  async listTransfers(filter: ListTransfersFilter = {}) {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.max(1, filter.limit ?? 20);

    const base: Record<string, string> = {};
    if (filter.productId) base.productId = filter.productId;

    const where = filter.outletId
      ? [
          { ...base, fromOutletId: filter.outletId },
          { ...base, toOutletId: filter.outletId },
        ]
      : base;

    const [data, total] = await this.stockTransferRepository.findAndCount({
      where,
      relations: { product: true, fromOutlet: true, toOutlet: true, movedBy: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  /** Purchase-in: creates the outlet/product row lazily and increments it. */
  async applyPurchaseIn(outletId: string, productId: string, baseQty: number) {
    await this.upsertDelta(outletId, productId, baseQty);
  }

  /**
   * Editing a purchase after the fact: applies a signed delta (positive or
   * negative) to correct a quantity/product/outlet mistake. Pass `manager`
   * to run inside the same transaction as the Purchase row and Products
   * update it's being corrected alongside.
   */
  async applyPurchaseAdjustment(
    outletId: string,
    productId: string,
    delta: number,
    manager?: EntityManager,
  ) {
    await this.upsertDelta(outletId, productId, delta, manager);
  }

  /** Order confirm: no floor — an outlet is allowed to go negative. */
  async applyOrderConsumption(
    outletId: string,
    productId: string,
    baseQty: number,
  ) {
    await this.upsertDelta(outletId, productId, -baseQty);
  }

  /** Order cancel/expiry: inverse of applyOrderConsumption. */
  async restoreOrderConsumption(
    outletId: string,
    productId: string,
    baseQty: number,
  ) {
    await this.upsertDelta(outletId, productId, baseQty);
  }

  private async upsertDelta(
    outletId: string,
    productId: string,
    delta: number,
    manager?: EntityManager,
  ) {
    const repo = manager
      ? manager.getRepository(OutletProductStock)
      : this.outletProductStockRepository;

    const existing = await repo.findOne({ where: { outletId, productId } });
    if (existing) {
      existing.quantity += delta;
      await repo.save(existing);
    } else {
      await repo.save({
        outletId,
        productId,
        quantity: delta,
      } as OutletProductStock);
    }
  }
}
