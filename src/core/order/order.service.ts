import { Injectable } from '@nestjs/common';
import { UpdateOrderDto } from './dto/update-order.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderDetails, OrderItems, DeliveryDetails } from './entities/order.entity';
import { User } from '../users/entities/user.entity';
import { ProductVariant } from '../product/entities/product-variant.entity';
import { OrderStatus, UserTypes } from 'src/common/enums';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(OrderDetails)
    private readonly orderDetailsRepository: Repository<OrderDetails>,
    @InjectRepository(OrderItems)
    private readonly orderItemsRepository: Repository<OrderItems>,
    @InjectRepository(DeliveryDetails)
    private readonly deliveryDetailsRepository: Repository<DeliveryDetails>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ProductVariant)
    private readonly productVariantRepository: Repository<ProductVariant>,
  ) {}

  async createOrder(phone: string, products: any[]) {
    try {
      const user = await this.userRepository.findOne({
        where: { phone, userType: UserTypes.CUSTOMER },
      });

      if (!user) return null;

      const order = await this.orderDetailsRepository.save(
        this.orderDetailsRepository.create({
          userId: user.id,
          status: OrderStatus.DRAFT,
          totalAmount: products.reduce(
            (acc, product) =>
              acc + parseFloat(product.item_price) * parseFloat(product.quantity),
            0,
          ),
        }),
      );

      if (!order) return null;

      console.log('order', products);

      await Promise.all(
        products.map(async (product) => {
          const variant = await this.productVariantRepository.findOne({
            where: { id: product.product_retailer_id },
          });
          if (!variant) {
            console.warn(`createOrder: variant not found for product_retailer_id=${product.product_retailer_id}`);
            return;
          }

          return this.orderItemsRepository.save(
            this.orderItemsRepository.create({
              orderId: order.id,
              productId: variant.productId,
              variantId: variant.id,
              quantity: parseFloat(product.quantity),
              price: parseFloat(product.item_price),
              totalPrice: parseFloat(product.item_price) * parseFloat(product.quantity),
            }),
          );
        }),
      );

      return order;
    } catch (error) {
      console.log('error', error);
    }
  }

  async findAll(filter: { pageNumber?: number; count?: number; status?: string }) {
    const takeCount = parseInt((filter.count ?? 10) + '');
    const skipCount = (parseInt((filter.pageNumber ?? 1) + '') - 1) * takeCount;

    const where: any = {};
    if (filter.status) where.status = filter.status;

    const [total, data] = await Promise.all([
      this.orderDetailsRepository.count({ where }),
      this.orderDetailsRepository.find({
        where,
        relations: { user: true, orderItems: true },
        order: { createdAt: 'DESC' },
        take: takeCount,
        skip: skipCount,
      }),
    ]);

    return { total, data };
  }

  async findOne(id: string) {
    return this.orderDetailsRepository.findOne({
      where: { id },
      relations: {
        user: true,
        orderItems: { product: { category: true } },
        deliveryDetails: true,
      },
    });
  }

  async confirmOrder(id: string) {
    await this.orderDetailsRepository.update(id, { status: OrderStatus.CONFIRMED });
    return { success: true };
  }

  async cancelOrder(id: string) {
    await this.orderDetailsRepository.update(id, { status: OrderStatus.CANCELLED });
    return { success: true };
  }

  async updateOrderAddress(addressData: any) {
    try {
      await this.deliveryDetailsRepository.save(
        this.deliveryDetailsRepository.create({
          orderId: addressData.flow_token,
          address: addressData.address,
          pinCode: addressData.pincode,
          phone: addressData.phone,
          name: addressData.name,
        }),
      );

      await this.orderDetailsRepository.update(addressData.flow_token, {
        status: OrderStatus.PENDING,
      });

      const order = await this.orderDetailsRepository.findOne({
        where: { id: addressData.flow_token },
        relations: { orderItems: { product: true }, deliveryDetails: true },
      });

      return order;
    } catch (error) {
      console.error('Error updating order address:', error);
      return null;
    }
  }

  async confirmOrderWithAddress(
    orderId: string,
    address: { name: string; address: string; pinCode: string; phone: string },
  ) {
    try {
      await this.deliveryDetailsRepository.save(
        this.deliveryDetailsRepository.create({
          orderId,
          address: address.address,
          pinCode: address.pinCode,
          phone: address.phone,
          name: address.name,
        }),
      );

      await this.orderDetailsRepository.update(orderId, {
        status: OrderStatus.PENDING,
      });

      const order = await this.orderDetailsRepository.findOne({
        where: { id: orderId },
        relations: { orderItems: { product: true }, deliveryDetails: true },
      });

      return order;
    } catch (error) {
      console.error('Error confirming order address:', error);
      return null;
    }
  }
}
