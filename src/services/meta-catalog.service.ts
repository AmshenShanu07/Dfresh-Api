import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from 'axios';
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Products } from "src/core/product/entities/product.entity";
import { MetaCatalogProductDto, MetaUpdateCatalogProductDto } from 'src/common/dto/meta-catlog-product.dto';

@Injectable()
export class MetaCatalogService {
  private readonly waCatlogId: string;
  private readonly waUserToken: string;
  private readonly waInstance: AxiosInstance;

  constructor(
    @InjectRepository(Products)
    private readonly productRepository: Repository<Products>,
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
    } catch (error) {
      console.error(
        'Error creating Facebook product:',
        error.response?.data || error.message,
      );
    }
  }

  async updateProduct(productId: string, productData: MetaUpdateCatalogProductDto) {
    try {
      const response = await this.waInstance.post(`/${productId}`, productData);
      return response.data;
    } catch (error) {
      console.error('Error hiding Facebook product:', error.response?.data || error.message);
    }
  }

  async visibilityProduct(productId: string, visibility: boolean) {
    try {
      const payload = { visibility: visibility ? 'published' : 'hidden' };
      const response = await this.waInstance.post(`/${productId}`, payload);
      return response.data;
    } catch (error) {
      console.error('Error hiding Facebook product:', error.response?.data || error.message);
    }
  }
}
