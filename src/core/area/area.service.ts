import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Area } from './entities/area.entity';
import { Outlets } from '../outlet/entities/outlet.entity';
import { LocalizedText } from '../../common/utils/localized-text';

export interface AreaInput {
  id?: string;
  name: LocalizedText;
}

@Injectable()
export class AreaService {
  constructor(
    @InjectRepository(Area)
    private readonly areaRepository: Repository<Area>,
    @InjectRepository(Outlets)
    private readonly outletRepository: Repository<Outlets>,
  ) {}

  /**
   * Reconciles an outlet agent's area list against what was submitted on the
   * Staff form: rows with no `id` are new areas (created bound to this
   * user+outlet), rows with an `id` are kept (renamed if changed), and any
   * existing area not present in the submitted list is soft-deleted so
   * historical UserAddress/OrderDetails references stay valid.
   */
  async reconcileAreasForStaff(
    userId: string,
    outletId: string,
    areas: AreaInput[] = [],
  ) {
    const outlet = await this.outletRepository.findOne({
      where: { id: outletId },
    });
    if (!outlet) {
      throw new BadRequestException('Outlet not found');
    }
    if (!outlet.wardId) {
      throw new BadRequestException(
        'Assign a ward to this outlet before adding areas',
      );
    }

    const existing = await this.areaRepository.find({
      where: { userId, isDeleted: false },
    });

    const submittedIds = new Set(
      areas.filter((a) => a.id).map((a) => a.id as string),
    );
    const toRemove = existing.filter((a) => !submittedIds.has(a.id));
    if (toRemove.length) {
      await this.areaRepository.update(
        { id: In(toRemove.map((a) => a.id)) },
        { isDeleted: true, isActive: false },
      );
    }

    const currentOutletAreas = await this.areaRepository.find({
      where: { outletId, isDeleted: false },
    });
    const namesInUse = new Map(
      currentOutletAreas
        .filter((a) => !submittedIds.has(a.id))
        .map((a) => [a.name.en.trim().toLowerCase(), a.id]),
    );

    for (const entry of areas) {
      const name = {
        en: entry.name?.en?.trim() ?? '',
        ml: entry.name?.ml?.trim() ?? '',
      };
      if (!name.en || !name.ml) continue;

      const conflict = namesInUse.get(name.en.toLowerCase());
      if (conflict && conflict !== entry.id) {
        throw new BadRequestException(
          `An area named "${name.en}" already exists for this outlet`,
        );
      }
      namesInUse.set(name.en.toLowerCase(), entry.id ?? name.en);

      if (entry.id) {
        await this.areaRepository.update(entry.id, { name });
      } else {
        await this.areaRepository.save(
          this.areaRepository.create({
            name,
            wardId: outlet.wardId,
            outletId: outlet.id,
            userId,
            isActive: true,
          }),
        );
      }
    }

    return this.findByUser(userId);
  }

  findByUser(userId: string) {
    return this.areaRepository.find({
      where: { userId, isDeleted: false },
      order: { createdAt: 'ASC' },
    });
  }

  findActiveByWard(wardId: string) {
    // `name` is jsonb — ordering on the column directly would sort by its raw
    // JSON text rather than the display name, so order on the English key.
    return this.areaRepository
      .createQueryBuilder('area')
      .where('area."wardId" = :wardId', { wardId })
      .andWhere('area."isActive" = true')
      .andWhere('area."isDeleted" = false')
      .orderBy("area.name->>'en'", 'ASC')
      .getMany();
  }

  findOneActive(id: string) {
    return this.areaRepository.findOne({
      where: { id, isActive: true, isDeleted: false },
    });
  }

  async deactivateAreasForUser(userId: string) {
    await this.areaRepository.update(
      { userId, isDeleted: false },
      { isDeleted: true, isActive: false },
    );
  }
}
