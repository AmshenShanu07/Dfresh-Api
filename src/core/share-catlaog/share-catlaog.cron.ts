import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { formatInTimeZone } from 'date-fns-tz';
import { In } from 'typeorm';
import { ShareCatalog } from './entities/share-catalog.entity';
import { ProductVariant } from '../product/entities/product-variant.entity';
import { User } from '../users/entities/user.entity';
import {
  UserTypes,
  ShareCatalogStatus,
  ENABLED_STATUSES,
} from 'src/common/enums';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { ShareCatlaogService } from './share-catlaog.service';
import { IST_TZ, computeCurrentWindowStart } from './share-catlaog.window';

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
    private readonly whatsappService: WhatsappService,
    private readonly shareCatlaogService: ShareCatlaogService,
  ) {}

  @Cron('*/3 * * * *')
  async checkAndShareCatalogs() {
    const now = new Date();
    this.logger.log(
      `Cron tick — IST ${formatInTimeZone(now, IST_TZ, 'EEE yyyy-MM-dd HH:mm')}`,
    );

    const activeCatalogs = await this.shareCatalogRepository.find({
      where: { status: In(ENABLED_STATUSES), isDeleted: false },
      relations: { ShareCatalogProducts: true },
    });

    for (const catalog of activeCatalogs) {
      const windowStart = computeCurrentWindowStart(
        now,
        catalog.daysOfWeek,
        catalog.startTime,
        catalog.endTime,
      );
      const inWindow = windowStart !== null;
      const isLive = catalog.status === ShareCatalogStatus.LIVE;
      const alreadyFired =
        catalog.lastWindowOpenedAt != null &&
        windowStart != null &&
        catalog.lastWindowOpenedAt.getTime() >= windowStart.getTime();

      if (inWindow && !isLive && !alreadyFired) {
        await this.openCatalog(catalog);
        catalog.status = ShareCatalogStatus.LIVE;
        catalog.lastWindowOpenedAt = windowStart;
        await this.shareCatalogRepository.save(catalog);
      } else if (!inWindow && isLive) {
        await this.shareCatlaogService.closeCatalog(catalog);
        catalog.status = ShareCatalogStatus.ACTIVE;
        await this.shareCatalogRepository.save(catalog);
        this.logger.log(`Share catalog ${catalog.id} window closed`);
      }
    }
  }

  private async openCatalog(catalog: ShareCatalog) {
    this.logger.log(`Opening share catalog ${catalog.id}`);
    const products = catalog.ShareCatalogProducts ?? [];

    const variantIds = products
      .filter((scp: any) => scp.variantId)
      .map((scp: any) => scp.variantId);

    if (variantIds.length) {
      await this.variantRepository
        .createQueryBuilder()
        .update(ProductVariant)
        .set({ isActive: true })
        .whereInIds(variantIds)
        .execute();
    }

    // `language` comes along so each broadcast is composed in the customer's
    // own language without a per-recipient lookup.
    const customers = await this.userRepository.find({
      where: { userType: UserTypes.CUSTOMER },
      select: ['phone', 'language'],
    });

    this.logger.log(`Broadcasting to ${customers.length} customers`);

    await Promise.allSettled(
      customers.map((c) => this.whatsappService.sendProduct(c.phone, c.language)),
    );
  }
}
