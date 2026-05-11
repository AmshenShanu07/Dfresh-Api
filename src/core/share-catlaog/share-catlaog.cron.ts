import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShareCatalog } from './entities/share-catalog.entity';
import { ProductVariant } from '../product/entities/product-variant.entity';
import { User } from '../users/entities/user.entity';
import { UserTypes } from 'src/common/enums';
import { MetaCatalogService } from 'src/services/meta-catalog.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Injectable()
export class ShareCatalogCronService {
  private readonly logger = new Logger(ShareCatalogCronService.name);

  constructor(
    @InjectRepository(ShareCatalog)
    private readonly shareCatalogRepository: Repository<ShareCatalog>,
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly metaCatalogService: MetaCatalogService,
    private readonly whatsappService: WhatsappService,
  ) {}

  @Cron('*/3 * * * *')
  async checkAndShareCatalogs() {
    const now = new Date();
    const todayDate = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM

    this.logger.log(`Cron tick — checking share catalogs for ${todayDate} ${currentTime}`);

    const pending = await this.shareCatalogRepository.find({
      where: { isActive: true, isPublished: false, publishDate: todayDate },
      relations: { ShareCatalogProducts: true },
    });

    for (const catalog of pending) {
      if (catalog.publishTime > currentTime) continue;

      this.logger.log(`Publishing share catalog ${catalog.id}`);

      // 1. Activate each variant on Meta
      await Promise.all(
        catalog.ShareCatalogProducts.filter((scp) => scp.productCatalogId).map((scp) =>
          this.metaCatalogService.updateProduct(scp.productCatalogId, {
            availability: 'in stock',
            price: scp.price * 100,
            visibility: 'published',
          }),
        ),
      );

      // 2. Mark variants as active in DB
      const variantIds = catalog.ShareCatalogProducts
        .filter((scp) => scp.variantId)
        .map((scp) => scp.variantId);

      if (variantIds.length) {
        await this.variantRepository
          .createQueryBuilder()
          .update(ProductVariant)
          .set({ isActive: true })
          .whereInIds(variantIds)
          .execute();
      }

      // 3. WhatsApp broadcast to all customers
      const customers = await this.userRepository.find({
        where: { userType: UserTypes.CUSTOMER },
        select: ['phone'],
      });

      this.logger.log(`Broadcasting to ${customers.length} customers`);

      await Promise.allSettled(
        customers.map((c) => this.whatsappService.sendProduct(c.phone)),
      );

      // 4. Mark as published
      await this.shareCatalogRepository.update(catalog.id, { isPublished: true });
      this.logger.log(`Share catalog ${catalog.id} published`);
    }
  }
}
