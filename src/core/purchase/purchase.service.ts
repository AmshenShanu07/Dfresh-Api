import { BadRequestException, Injectable } from '@nestjs/common';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { CleaningDetailsDto } from './dto/cleaning-details.dto';
import { ThresholdLevelDto } from './dto/thereshold-level.dto';
import { FilterCommonDto } from 'src/common/dto/filter.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Purchase } from './entities/purchase.entity';
import { Products } from '../product/entities/product.entity';
import { Outlets } from '../outlet/entities/outlet.entity';
import { User } from '../users/entities/user.entity';
import { toBase } from 'src/common/utils/units';
import { OutletStockService } from '../outlet-stock/outlet-stock.service';

@Injectable()
export class PurchaseService {
  constructor(
    @InjectRepository(Purchase)
    private readonly purchaseRepository: Repository<Purchase>,
    @InjectRepository(Products)
    private readonly productRepository: Repository<Products>,
    @InjectRepository(Outlets)
    private readonly outletRepository: Repository<Outlets>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly outletStockService: OutletStockService,
    private readonly dataSource: DataSource,
  ) {}

  async create(createPurchaseDto: CreatePurchaseDto) {
    const [product, outlet, supplier] = await Promise.all([
      this.productRepository.findOne({ where: { id: createPurchaseDto.productId } }),
      this.outletRepository.findOne({ where: { id: createPurchaseDto.outletId } }),
      this.userRepository.findOne({ where: { id: createPurchaseDto.supplierId } }),
    ]);

    if (!product) throw new BadRequestException('Product not found');
    if (!outlet) throw new BadRequestException('Outlet not found');
    if (!supplier) throw new BadRequestException('Supplier not found');

    const purchase = await this.purchaseRepository.save(
      this.purchaseRepository.create({
        productId: createPurchaseDto.productId,
        quantity: createPurchaseDto.quantity,
        quantityUnit: createPurchaseDto.quantityUnit,
        outletId: createPurchaseDto.outletId,
        totalPrice: createPurchaseDto.totalPrice,
        supplierId: createPurchaseDto.supplierId,
        batchNumber: createPurchaseDto.batchNumber,
      }),
    );

    const baseQty = toBase(
      createPurchaseDto.quantity,
      createPurchaseDto.quantityUnit,
    );

    await this.productRepository.increment(
      { id: createPurchaseDto.productId },
      'totalQuantity',
      baseQty,
    );

    await this.outletStockService.applyPurchaseIn(
      createPurchaseDto.outletId,
      createPurchaseDto.productId,
      baseQty,
    );

    return purchase;
  }

  async update(id: string, updatePurchaseDto: UpdatePurchaseDto) {
    const purchase = await this.purchaseRepository.findOne({ where: { id } });
    if (!purchase) throw new BadRequestException('Purchase not found');

    const hasDownstream =
      purchase.releasedQtny != null ||
      purchase.cleanedQnty != null ||
      purchase.cleanedCount != null ||
      purchase.thresholdQnty != null;

    const newProductId = updatePurchaseDto.productId ?? purchase.productId;
    const newOutletId = updatePurchaseDto.outletId ?? purchase.outletId;
    const newQuantity = updatePurchaseDto.quantity ?? purchase.quantity;
    const newQuantityUnit =
      updatePurchaseDto.quantityUnit ?? purchase.quantityUnit;

    const stockAffecting =
      newProductId !== purchase.productId ||
      newOutletId !== purchase.outletId ||
      newQuantity !== purchase.quantity ||
      newQuantityUnit !== purchase.quantityUnit;

    if (stockAffecting && hasDownstream) {
      throw new BadRequestException(
        'Cannot change product, outlet, or quantity — cleaning details or a threshold have already been recorded for this purchase',
      );
    }

    const [product, outlet, supplier] = await Promise.all([
      newProductId !== purchase.productId
        ? this.productRepository.findOne({ where: { id: newProductId } })
        : Promise.resolve(true),
      newOutletId !== purchase.outletId
        ? this.outletRepository.findOne({ where: { id: newOutletId } })
        : Promise.resolve(true),
      updatePurchaseDto.supplierId &&
      updatePurchaseDto.supplierId !== purchase.supplierId
        ? this.userRepository.findOne({
            where: { id: updatePurchaseDto.supplierId },
          })
        : Promise.resolve(true),
    ]);

    if (!product) throw new BadRequestException('Product not found');
    if (!outlet) throw new BadRequestException('Outlet not found');
    if (!supplier) throw new BadRequestException('Supplier not found');

    await this.dataSource.transaction(async (manager) => {
      const oldBaseQty = toBase(purchase.quantity, purchase.quantityUnit);
      const newBaseQty = toBase(newQuantity, newQuantityUnit);

      const samePair =
        newProductId === purchase.productId &&
        newOutletId === purchase.outletId;

      if (samePair) {
        const delta = newBaseQty - oldBaseQty;
        if (delta !== 0) {
          await manager
            .createQueryBuilder()
            .update(Products)
            .set({
              totalQuantity: () => 'GREATEST(0, "totalQuantity" + :delta)',
            })
            .where('id = :id', { id: newProductId })
            .setParameter('delta', delta)
            .execute();

          await this.outletStockService.applyPurchaseAdjustment(
            newOutletId,
            newProductId,
            delta,
            manager,
          );
        }
      } else {
        await manager
          .createQueryBuilder()
          .update(Products)
          .set({
            totalQuantity: () => 'GREATEST(0, "totalQuantity" - :qty)',
          })
          .where('id = :id', { id: purchase.productId })
          .setParameter('qty', oldBaseQty)
          .execute();

        await this.outletStockService.applyPurchaseAdjustment(
          purchase.outletId,
          purchase.productId,
          -oldBaseQty,
          manager,
        );

        await manager
          .createQueryBuilder()
          .update(Products)
          .set({
            totalQuantity: () => 'GREATEST(0, "totalQuantity" + :qty)',
          })
          .where('id = :id', { id: newProductId })
          .setParameter('qty', newBaseQty)
          .execute();

        await this.outletStockService.applyPurchaseAdjustment(
          newOutletId,
          newProductId,
          newBaseQty,
          manager,
        );
      }

      await manager.update(Purchase, id, {
        productId: newProductId,
        outletId: newOutletId,
        quantity: newQuantity,
        quantityUnit: newQuantityUnit,
        totalPrice: updatePurchaseDto.totalPrice ?? purchase.totalPrice,
        supplierId: updatePurchaseDto.supplierId ?? purchase.supplierId,
        batchNumber: updatePurchaseDto.batchNumber ?? purchase.batchNumber,
      });
    });

    return this.findOne(id);
  }

  async addCleaningDetails(id: string, cleaningDetails: CleaningDetailsDto) {
    const purchase = await this.purchaseRepository.findOne({ where: { id } });

    if (!purchase) throw new BadRequestException('Purchase not found');

    await this.purchaseRepository.update(id, {
      releasedQtny: cleaningDetails.releasedQnty,
      releasedQntyUnit: cleaningDetails.releasedQntyUnit,
      cleanedQnty: cleaningDetails.cleanedQnty,
      cleanedQntyUnit: cleaningDetails.cleanedQntyUnit,
      cleanedCount: cleaningDetails.cleanedCount,
    });

    return this.purchaseRepository.findOne({ where: { id } });
  }

  async addThreshold(id: string, threshold: ThresholdLevelDto) {
    const purchase = await this.purchaseRepository.findOne({ where: { id } });

    if (!purchase) throw new BadRequestException('Purchase not found');

    await this.purchaseRepository.update(id, {
      thresholdQnty: threshold.thresholdQnty,
      thresholdQntyUnit: threshold.thresholdQntyUnit,
    });

    return this.purchaseRepository.findOne({ where: { id } });
  }

  findAll() {
    return this.purchaseRepository.find();
  }

  async getList(filter: FilterCommonDto) {
    let takeCount = parseInt(filter.count + '');
    let skipCount = (parseInt(filter.pageNumber + '') - 1) * takeCount;

    if (takeCount < 0 || skipCount < 0) {
      takeCount = undefined;
      skipCount = undefined;
    }

    const [total, data] = await Promise.all([
      this.purchaseRepository.count(),
      this.purchaseRepository.find({
        relations: { product: { category: true } },
        order: {
          createdAt: filter.sortOrder === -1 ? 'ASC' : 'DESC',
        },
        take: takeCount,
        skip: skipCount,
      }),
    ]);

    return { total, data };
  }

  findOne(id: string) {
    return this.purchaseRepository.findOne({
      where: { id },
      relations: { product: true, outlet: true, supplier: true },
    });
  }

  remove(id: string) {
    return this.purchaseRepository.delete(id);
  }
}
