import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { ShareCatalog } from './entities/share-catalog.entity';
import { ProductVariant } from '../product/entities/product-variant.entity';
import { User } from '../users/entities/user.entity';
import { UserTypes } from 'src/common/enums';
import { MetaCatalogService } from 'src/services/meta-catalog.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { ShareCatlaogService } from './share-catlaog.service';

const IST_TZ = 'Asia/Kolkata';
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function ymdToWeekday(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function subOneDayYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d));
  prev.setUTCDate(prev.getUTCDate() - 1);
  const pm = String(prev.getUTCMonth() + 1).padStart(2, '0');
  const pd = String(prev.getUTCDate()).padStart(2, '0');
  return `${prev.getUTCFullYear()}-${pm}-${pd}`;
}

export function computeCurrentWindowStart(
  now: Date,
  daysOfWeek: string[],
  startTime: string,
  endTime: string,
): Date | null {
  if (!daysOfWeek || daysOfWeek.length === 0) return null;

  const todayIST = formatInTimeZone(now, IST_TZ, 'yyyy-MM-dd');
  const nowTime = formatInTimeZone(now, IST_TZ, 'HH:mm');
  const todayDow = ymdToWeekday(todayIST);
  const days = new Set(daysOfWeek.map((d) => d.toLowerCase()));

  if (startTime < endTime) {
    if (days.has(todayDow) && nowTime >= startTime && nowTime < endTime) {
      return fromZonedTime(`${todayIST}T${startTime}:00`, IST_TZ);
    }
    return null;
  }

  // Overnight: endTime <= startTime. (Equality rejected by DTO.)
  if (days.has(todayDow) && nowTime >= startTime) {
    return fromZonedTime(`${todayIST}T${startTime}:00`, IST_TZ);
  }
  const yesterdayIST = subOneDayYmd(todayIST);
  if (days.has(ymdToWeekday(yesterdayIST)) && nowTime < endTime) {
    return fromZonedTime(`${yesterdayIST}T${startTime}:00`, IST_TZ);
  }
  return null;
}

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
    private readonly shareCatlaogService: ShareCatlaogService,
  ) {}

  @Cron('*/3 * * * *')
  async checkAndShareCatalogs() {
    const now = new Date();
    this.logger.log(
      `Cron tick — IST ${formatInTimeZone(now, IST_TZ, 'EEE yyyy-MM-dd HH:mm')}`,
    );

    const activeCatalogs = await this.shareCatalogRepository.find({
      where: { isActive: true, isDeleted: false },
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
      const alreadyFired =
        catalog.lastWindowOpenedAt != null &&
        windowStart != null &&
        catalog.lastWindowOpenedAt.getTime() >= windowStart.getTime();

      if (inWindow && !catalog.isPublished && !alreadyFired) {
        await this.openCatalog(catalog);
        catalog.isPublished = true;
        catalog.lastWindowOpenedAt = windowStart;
        await this.shareCatalogRepository.save(catalog);
      } else if (!inWindow && catalog.isPublished) {
        await this.shareCatlaogService.closeCatalogMeta(catalog);
        catalog.isPublished = false;
        await this.shareCatalogRepository.save(catalog);
        this.logger.log(`Share catalog ${catalog.id} window closed`);
      }
    }
  }

  private async openCatalog(catalog: ShareCatalog) {
    this.logger.log(`Opening share catalog ${catalog.id}`);
    const products = catalog.ShareCatalogProducts ?? [];

    await Promise.all(
      products
        .filter((scp: any) => scp.productCatalogId)
        .map((scp: any) =>
          this.metaCatalogService.updateProduct(scp.productCatalogId, {
            availability: 'in stock',
            price: scp.price * 100,
            visibility: 'published',
          }),
        ),
    );

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

    const customers = await this.userRepository.find({
      where: { userType: UserTypes.CUSTOMER },
      select: ['phone'],
    });

    this.logger.log(`Broadcasting to ${customers.length} customers`);

    await Promise.allSettled(
      customers.map((c) => this.whatsappService.sendProduct(c.phone)),
    );
  }
}
