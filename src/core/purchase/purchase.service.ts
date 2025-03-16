import { BadRequestException, Injectable } from '@nestjs/common';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { PrismaService } from 'src/services/prisma.service';
import { CleaningDetailsDto } from './dto/cleaning-details.dto';
import { ThresholdLevelDto } from './dto/thereshold-level.dto';
import { FilterCommonDto } from 'src/common/dto/filter.dto';

@Injectable()
export class PurchaseService {
  constructor(private readonly prismaService: PrismaService) {}
  async create(createPurchaseDto: CreatePurchaseDto) {
    const [product, outlet, supplier] = await Promise.all([
      this.prismaService.products.findFirst({
        where: { id: createPurchaseDto.productId },
      }),
      this.prismaService.outlets.findFirst({
        where: { id: createPurchaseDto.outletId },
      }),
      this.prismaService.user.findFirst({
        where: { id: createPurchaseDto.supplierId },
      }),
    ]);

    if (!product) return new BadRequestException('Product not found');
    if (!outlet) return new BadRequestException('Outlet not found');
    if (!supplier) return new BadRequestException('Supplier not found');

    return this.prismaService.purchase.create({
      data: {
        productId: createPurchaseDto.productId,
        quantity: createPurchaseDto.quantity,
        quantityUnit: createPurchaseDto.quantityUnit,
        outletId: createPurchaseDto.outletId,
        totalPrice: createPurchaseDto.totalPrice,
        supplierId: createPurchaseDto.supplierId,
        pricePerUnit: createPurchaseDto.pricePerUnit,
        batchNumber: createPurchaseDto.batchNumber,
      },
    });
  }

  async addCleaningDetails(id: string, cleaningDetails: CleaningDetailsDto) {
    const purchase = await this.prismaService.purchase.findFirst({
      where: { id },
    });

    if (!purchase) return new BadRequestException('Purchase not found');

    return this.prismaService.purchase.update({
      where: { id },
      data: {
        releasedQtny: cleaningDetails.releasedQnty,
        releasedQntyUnit: cleaningDetails.releasedQntyUnit,
        cleanedQnty: cleaningDetails.cleanedQnty,
        cleanedQntyUnit: cleaningDetails.cleanedQntyUnit,
        cleanedCount: cleaningDetails.cleanedCount,
      },
    });
  }

  async addThreshold(id: string, threshold: ThresholdLevelDto) {
    const purchase = await this.prismaService.purchase.findFirst({
      where: { id },
    });

    if (!purchase) return new BadRequestException('Purchase not found');

    return this.prismaService.purchase.update({
      where: { id },
      data: {
        thresholdQnty: threshold.thresholdQnty,
        thresholdQntyUnit: threshold.thresholdQntyUnit,
      },
    });
  }

  findAll() {
    return this.prismaService.purchase.findMany();
  }

  async getList(filter: FilterCommonDto) {
    let takeCount = parseInt(filter.count + '');
    let skipCount = (parseInt(filter.pageNumber + '') - 1) * takeCount;

    if (takeCount < 0 || skipCount < 0) {
      takeCount = undefined;
      skipCount = undefined;
    }

    const [total, data] = await Promise.all([
      this.prismaService.purchase.count({}),
      this.prismaService.purchase.findMany({
        include: { product: { include: { category: true } } },
        orderBy: {
          createdAt: filter.sortOrder === -1 ? 'asc' : 'desc',
        },
        take: takeCount,
        skip: skipCount,
      }),
    ]);

    return { total, data };
  }

  findOne(id: string) {
    return this.prismaService.purchase.findFirst({
      where: { id },
      include: { product: true, outlet: true, supplier: true },
    });
  }

  remove(id: string) {
    return this.prismaService.purchase.delete({ where: { id } });
  }
}
