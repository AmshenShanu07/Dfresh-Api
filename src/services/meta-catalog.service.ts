import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from 'axios';
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Products } from "src/core/product/entities/product.entity";
import { ProductVariant } from "src/core/product/entities/product-variant.entity";
import { MetaCatalogProductDto, MetaUpdateCatalogProductDto } from 'src/common/dto/meta-catlog-product.dto';

@Injectable()
export class MetaCatalogService {
  private readonly waCatlogId: string;
  private readonly waUserToken: string;
  private readonly waInstance: AxiosInstance;

  constructor(
    @InjectRepository(Products)
    private readonly productRepository: Repository<Products>,
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
    private readonly configService: ConfigService,
  ) {
    this.waCatlogId = "1978442546302613";
    this.waUserToken = this.configService.get<string>('WA_USER_TOKEN');

    this.waInstance = axios.create({
      baseURL: `https://graph.facebook.com/v19.0`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.waUserToken}`,
      },
    });
  }

  async createProduct(productData: MetaCatalogProductDto) {
    try {
      const response = await this.waInstance.post(`/${this.waCatlogId}/products`, productData);

      console.log('product created:', response.data);
      if (response.data?.id) {
        await this.productRepository.update(productData.retailer_id, {
          catalogId: response.data.id,
        });
      }
    } catch (error:any ) {
      console.error(
        'Error creating Facebook product:',
        error.response?.data || error.message,
      );
    }
  }

  async createVariant(variantId: string, productId: string, productName: string, weight: string, imageUrl: string, categoryName?: string) {
    try {
      const payload: MetaCatalogProductDto = {
        retailer_id: variantId,
        name: `${productName} | ${weight}`,
        description: `${productName} - ${weight}`,
        availability: 'out of stock',
        condition: 'new',
        price: 1,
        currency: 'INR',
        url: 'https://hectogon-global.vercel.app/',
        image_url: imageUrl || '',
        brand: 'Dfresh',
        item_group_id: productId,
        product_type: categoryName,
      };

      const response = await this.waInstance.post(`/${this.waCatlogId}/products`, payload);

      console.log('variant created on Meta:', response.data);
      if (response.data?.id) {
        await this.variantRepository.update(variantId, {
          metaProductId: response.data.id,
        });
      }
    } catch (error:any) {
      console.error(
        'Error creating Facebook variant:',
        error.response?.data || error.message,
      );
    }
  }

  async updateProduct(productId: string, productData: MetaUpdateCatalogProductDto) {
    try {
      const response = await this.waInstance.post(`/${productId}`, productData);
      return response.data;
    } catch (error: any) {
      console.error('Error updating Facebook product:', error.response?.data || error.message);
    }
  }

  async visibilityProduct(productId: string, visibility: boolean) {
    try {
      const payload = { visibility: visibility ? 'published' : 'hidden' };
      const response = await this.waInstance.post(`/${productId}`, payload);
      return response.data;
    } catch (error:any) {
      console.error('Error hiding Facebook product:', error.response?.data || error.message);
    }
  }
}
