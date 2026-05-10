import { Injectable } from '@nestjs/common';
import { UpdateOrderDto } from './dto/update-order.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderDetails, OrderItems, DeliveryDetails } from './entities/order.entity';
import { User } from '../users/entities/user.entity';
import { UserTypes } from 'src/common/enums';

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
        products.map((product) =>
          this.orderItemsRepository.save(
            this.orderItemsRepository.create({
              orderId: order.id,
              productId: product.product_retailer_id,
              quantity: parseFloat(product.quantity),
              price: parseFloat(product.item_price),
              totalPrice: parseFloat(product.item_price) * parseFloat(product.quantity),
            }),
          ),
        ),
      );

      return order;
    } catch (error) {
      console.log('error', error);
    }
  }

  findAll() {
    return `This action returns all order`;
  }

  findOne(id: number) {
    return `This action returns a #${id} order`;
  }

  update(id: number, updateOrderDto: UpdateOrderDto) {
    return `This action updates a #${id} order`;
  }

  remove(id: number) {
    return `This action removes a #${id} order`;
  }

  async updateOrderAddress(addressData: any) {
    try {
      const order = await this.orderDetailsRepository.findOne({
        where: { id: addressData.flow_token },
        relations: { orderItems: { product: true } },
      });

      await this.deliveryDetailsRepository.save(
        this.deliveryDetailsRepository.create({
          orderId: addressData.flow_token,
          address: addressData.address,
          pinCode: addressData.pincode,
          phone: addressData.phone,
          name: addressData.name,
        }),
      );

      return order;
    } catch (error) {
      console.error('Error updating order address:', error);
      return null;
    }
  }
}
