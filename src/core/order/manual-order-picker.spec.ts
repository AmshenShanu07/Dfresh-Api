import { ManualOrderService } from './manual-order.service';
import { ShareCatalogStatus, MeasurementType } from 'src/common/enums';

/**
 * The picker must list variants filtered on isDeleted ONLY. ProductVariant
 * .isActive is owned by the share-catalog cron — it goes false whenever the
 * catalog pauses or expires — so filtering on it would empty the picker at
 * exactly the moments a manual order is most needed.
 */
class FakeProductRepository {
  lastFindOptions: any = null;
  rows: any[];

  constructor(rows: any[]) {
    this.rows = rows;
  }

  async find(options: any) {
    this.lastFindOptions = options;
    return this.rows;
  }
}

class FakeShareCatalogProductsRepository {
  rows: any[];

  constructor(rows: any[]) {
    this.rows = rows;
  }

  async find() {
    return this.rows;
  }
}

function buildService(products: any[], catalogEntries: any[]) {
  const productRepo = new FakeProductRepository(products);
  const scpRepo = new FakeShareCatalogProductsRepository(catalogEntries);
  const service = new ManualOrderService(
    {} as any, // dataSource
    {} as any, // userRepository
    {} as any, // productVariantRepository
    productRepo as any, // productRepository
    scpRepo as any, // shareCatalogProductsRepository
    {} as any, // wardRepository
    {} as any, // areaService
    {} as any, // orderService
  );
  return { service, productRepo };
}

const product = {
  id: 'product-1',
  name: 'Seer Fish',
  measurementType: MeasurementType.WEIGHT,
  cleaning: true,
  totalQuantity: 5000,
  category: { name: 'Fish' },
  variants: [
    {
      id: 'variant-1',
      weight: 500,
      unit: 'g',
      cleaningCharge: 20,
      isDeleted: false,
      cuttingStyles: [
        {
          cuttingStyleId: 'style-curry',
          price: 15,
          isDeleted: false,
          cuttingStyle: { id: 'style-curry', name: 'Curry Cut' },
        },
        {
          cuttingStyleId: 'style-old',
          price: 99,
          isDeleted: true,
          cuttingStyle: { id: 'style-old', name: 'Retired Cut' },
        },
      ],
    },
  ],
};

describe('ManualOrderService.getPickerProducts', () => {
  it('filters variants on isDeleted, never on isActive', async () => {
    const { service, productRepo } = buildService([product], []);

    await service.getPickerProducts();

    const variantWhere = productRepo.lastFindOptions.where.variants;
    expect(variantWhere).toEqual({ isDeleted: false });
    expect(variantWhere).not.toHaveProperty('isActive');
  });

  it('returns the product with its stock and category', async () => {
    const { service } = buildService([product], []);

    const [result] = await service.getPickerProducts();

    expect(result.id).toBe('product-1');
    expect(result.name).toBe('Seer Fish');
    expect(result.categoryName).toBe('Fish');
    expect(result.totalQuantity).toBe(5000);
    expect(result.cleaning).toBe(true);
  });

  it('exposes each cutting style by its master id and drops deleted ones', async () => {
    const { service } = buildService([product], []);

    const [result] = await service.getPickerProducts();

    expect(result.variants[0].cuttingStyles).toEqual([
      { id: 'style-curry', name: 'Curry Cut', price: 15 },
    ]);
  });

  it('prefills the live catalog price for a catalogued variant', async () => {
    const { service } = buildService(
      [product],
      [
        {
          variantId: 'variant-1',
          price: 250,
          shareCatalog: {
            status: ShareCatalogStatus.LIVE,
            createdAt: new Date('2026-08-01'),
            isDeleted: false,
          },
        },
      ],
    );

    const [result] = await service.getPickerProducts();

    expect(result.variants[0].catalogPrice).toBe(250);
  });

  it('leaves catalogPrice null for an off-catalog variant', async () => {
    const { service } = buildService([product], []);

    const [result] = await service.getPickerProducts();

    expect(result.variants[0].catalogPrice).toBeNull();
  });

  it('omits products left with no variants', async () => {
    const bare = { ...product, variants: [] };
    const { service } = buildService([bare], []);

    expect(await service.getPickerProducts()).toEqual([]);
  });
});
