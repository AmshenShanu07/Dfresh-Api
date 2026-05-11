import { BadRequestException, Injectable } from '@nestjs/common';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { CleaningDetailsDto } from './dto/cleaning-details.dto';
import { ThresholdLevelDto } from './dto/thereshold-level.dto';
import { FilterCommonDto } from 'src/common/dto/filter.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Purchase } from './entities/purchase.entity';
import { Products } from '../product/entities/product.entity';
import { Outlets } from '../outlet/entities/outlet.entity';
import { User } from '../users/entities/user.entity';

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
  ) {}

  async create(createPurchaseDto: CreatePurchaseDto) {
    const [product, outlet, supplier] = await Promise.all([
      this.productRepository.findOne({ where: { id: createPurchaseDto.productId } }),
      this.outletRepository.findOne({ where: { id: createPurchaseDto.outletId } }),
      this.userRepository.findOne({ where: { id: createPurchaseDto.supplierId } }),
    ]);

    if (!product) return new BadRequestException('Product not found');
    if (!outlet) return new BadRequestException('Outlet not found');
    if (!supplier) return new BadRequestException('Supplier not found');

    const purchase = await this.purchaseRepository.save(
      this.purchaseRepository.create({
        productId: createPurchaseDto.productId,
        quantity: createPurchaseDto.quantity,
        quantityUnit: createPurchaseDto.quantityUnit,
        outletId: createPurchaseDto.outletId,
        totalPrice: createPurchaseDto.totalPrice,
        supplierId: createPurchaseDto.supplierId,
        pricePerUnit: createPurchaseDto.pricePerUnit,
        batchNumber: createPurchaseDto.batchNumber,
      }),
    );

    await this.productRepository.increment(
      { id: createPurchaseDto.productId },
      'totalQuantity',
      createPurchaseDto.quantity,
    );

    return purchase;
  }

  async addCleaningDetails(id: string, cleaningDetails: CleaningDetailsDto) {
    const purchase = await this.purchaseRepository.findOne({ where: { id } });

    if (!purchase) return new BadRequestException('Purchase not found');

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

    if (!purchase) return new BadRequestException('Purchase not found');

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
