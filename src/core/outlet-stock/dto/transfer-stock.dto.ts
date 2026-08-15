import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';
import { ProductUnits } from 'src/common/enums';

export class TransferStockDto {
  @ApiProperty({ example: '' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ example: '' })
  @IsString()
  @IsNotEmpty()
  fromOutletId: string;

  @ApiProperty({ example: '' })
  @IsString()
  @IsNotEmpty()
  toOutletId: string;

  @ApiProperty({ example: 5 })
  @IsNumber()
  @IsPositive()
  quantity: number;

  @ApiProperty({ example: ProductUnits.KG })
  @IsNotEmpty()
  @IsEnum(ProductUnits)
  quantityUnit: ProductUnits;

  // Frontend reads this from the `userId` auth cookie (per this app's existing
  // convention — no controller here reads the JWT identity off request.user).
  @ApiProperty({ example: '' })
  @IsString()
  @IsNotEmpty()
  movedByUserId: string;
}
