import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { UsersModule } from './core/users/users.module';
import { OutletModule } from './core/outlet/outlet.module';
import { CategoryModule } from './core/category/category.module';
import { ProductModule } from './core/product/product.module';
import { PurchaseModule } from './core/purchase/purchase.module';
import { CatlogModule } from './core/catlog/catlog.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WhatsappModule } from './core/whatsapp/whatsapp.module';
import { ShareCatlaogModule } from './core/share-catlaog/share-catlaog.module';
import { UploadModule } from './core/upload/upload.module';
import { OrderModule } from './core/order/order.module';
import { WardModule } from './core/ward/ward.module';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: './.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: true,
      }),
    }),
    UsersModule,
    OutletModule,
    CategoryModule,
    ProductModule,
    PurchaseModule,
    CatlogModule,
    WhatsappModule,
    ShareCatlaogModule,
    UploadModule,
    OrderModule,
    WardModule,
  ],
})
export class AppModule {}
