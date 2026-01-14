import { PartialType } from '@nestjs/swagger';

export class MetaCatalogProductDto {
  retailer_id: string;
  name: string;
  description: string;
  availability: 'out of stock' | 'in stock';
  condition: string;
  price: number;
  currency: string;
  url: string;
  image_url: string;
  brand: string;
}

export class MetaUpdateCatalogProductDto extends PartialType(MetaCatalogProductDto){
  visibility?: "published" | 'hidden';
}