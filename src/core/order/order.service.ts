import { Injectable } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PrismaService } from 'src/services/prisma.service';
import { UserTypes } from '@prisma/client';

@Injectable()
export class OrderService {

  constructor(private readonly prismaService: PrismaService) {}

  async createOrder(phone: string, products: any[]) {
    try {

      const user = await this.prismaService.user.findFirst({
        where: {
          phone: phone,
          userType: UserTypes.CUSTOMER,
        }
      });
  
      if(!user) return null;
  
      const order = await this.prismaService.orderDetails.create({
        data: {
          userId: user.id,
          totalAmount: products.reduce((acc, product) => acc + parseFloat(product.item_price) * parseFloat(product.quantity), 0),
        },
      });
  
      if(!order) return null;

      console.log('order',products);
  
      await Promise.all(products.map((product) => {
        return this.prismaService.orderItems.create({
          data: {
            orderId: order.id,
            productId: product.product_retailer_id,
            quantity: parseFloat(product.quantity),
            price: parseFloat(product.item_price),
            totalPrice: parseFloat(product.item_price) * parseFloat(product.quantity),
          },
          select: {
            id: true,
            quantity: true,
            price: true,
            totalPrice: true,
            product: {
              select: {
                name: true,
              }
            }
          }
        });
      }))

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
      
      const order = await this.prismaService.orderDetails.findFirst({
        where: { id: addressData.flow_token },
        select: {
          id: true,
          totalAmount: true,
          orderItems: {
            select: {
              id: true,
              quantity: true,
              price: true,
              product: {
                select: {
                  name: true,
                }
              }
            }
          }
        }
      });
  
      await this.prismaService.deliveryDetails.create({
        data: {
          orderId: addressData.flow_token,
          address: addressData.address,
          pinCode: addressData.pincode,
          phone: addressData.phone,  
          name: addressData.name,
        },
      });
  
      return order;

    } catch (error) {
      console.error('Error updating order address:', error);
      return null;
    }


  }
}
