import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { subDays } from 'date-fns';
import { Products } from '../product/entities/product.entity';
import { MeasurementType, OrderStatus } from 'src/common/enums';
import { isUnitInFamily, toBase, Unit } from 'src/common/utils/units';
import { positiveIntOr } from 'src/common/utils/pagination';
import { ThresholdLevelDto } from './dto/thereshold-level.dto';
import { StockLevelFilterDto } from './dto/stock-level-filter.dto';
import {
  buildStockLevelRows,
  StockLevelPurchase,
  USAGE_WINDOW_DAYS,
} from './stock-level';

/** Orders whose stock counts as used: placed and not cancelled or abandoned. */
const USAGE_STATUSES = [
  OrderStatus.CONFIRMED,
  OrderStatus.DISPATCHED,
  OrderStatus.DELIVERED,
];

@Injectable()
export class StockLevelService {
  constructor(
    @InjectRepository(Products)
    private readonly productRepository: Repository<Products>,
    private readonly dataSource: DataSource,
  ) {}

  async getList(filter: StockLevelFilterDto) {
    const take = positiveIntOr(filter.count, 10);
    const skip = (positiveIntOr(filter.pageNumber, 1) - 1) * take;

    // The product list is small (tens of rows), so filter, sort and paginate
    // in memory — sorting by computed usage can't be pushed into the query.
    const [products, latestPurchases, usage] = await Promise.all([
      this.productRepository.find({
        where: { isDeleted: false },
        select: {
          id: true,
          name: true,
          categoryId: true,
          measurementType: true,
          totalQuantity: true,
          threshold: true,
        },
      }),
      // Every identifier is double-quoted by hand: raw SQL gets no alias
      // quoting, and Postgres folds unquoted camelCase names to lowercase.
      this.dataSource.query(
        `SELECT DISTINCT ON (p."productId")
                p."productId", p."quantity", p."quantityUnit", p."createdAt",
                p."cleanedQnty", p."cleanedQntyUnit",
                p."releasedQtny", p."releasedQntyUnit"
           FROM "Purchase" p
          ORDER BY p."productId", p."createdAt" DESC`,
      ) as Promise<StockLevelPurchase[]>,
      this.dataSource.query(
        `SELECT oi."productId" AS "productId",
                SUM(v."weight" * oi."quantity") AS "used"
           FROM "OrderItems" oi
           JOIN "OrderDetails" od ON od."id" = oi."orderId"
           JOIN "ProductVariants" v ON v."id" = oi."variantId"
          WHERE od."status"::text = ANY($1)
            AND od."createdAt" >= $2
          GROUP BY oi."productId"`,
        [USAGE_STATUSES, subDays(new Date(), USAGE_WINDOW_DAYS)],
      ) as Promise<{ productId: string; used: string }[]>,
    ]);

    const usedByProduct = new Map(
      usage.map((u) => [u.productId, Number(u.used) || 0]),
    );
    const rows = buildStockLevelRows(products, latestPurchases, usedByProduct, {
      categoryId: filter.categoryId || undefined,
      sort: filter.sort,
    });

    return { total: rows.length, data: rows.slice(skip, skip + take) };
  }

  async setThreshold(productId: string, dto: ThresholdLevelDto) {
    const product = await this.productRepository.findOne({
      where: { id: productId, isDeleted: false },
    });
    if (!product) throw new BadRequestException('Product not found');

    const type = product.measurementType ?? MeasurementType.WEIGHT;
    const unit = String(dto.thresholdQntyUnit).toLowerCase() as Unit;
    if (!isUnitInFamily(unit, type)) {
      throw new BadRequestException(
        `Unit "${dto.thresholdQntyUnit}" is not valid for a ${type} product`,
      );
    }
    if (dto.thresholdQnty < 0) {
      throw new BadRequestException('Threshold must be 0 or more');
    }

    await this.productRepository.update(productId, {
      threshold: toBase(dto.thresholdQnty, unit),
    });
    return { productId, threshold: toBase(dto.thresholdQnty, unit) };
  }
}
