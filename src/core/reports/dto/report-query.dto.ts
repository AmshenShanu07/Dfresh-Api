import { ApiPropertyOptional, ApiProperty, OmitType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { OrderStatus, PaymentMethod } from 'src/common/enums';
import { RANGE_KEYS, RangeKey } from 'src/common/utils/date-range';

/** `?status=CONFIRMED,DELIVERED` → ['CONFIRMED','DELIVERED']. */
const csvToArray = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : value;

/**
 * One permissive superset DTO for all 13 reports.
 *
 * Per-report enforcement happens in pickFilters(), which narrows this bag down
 * to the keys the report advertises — see reports.filters.ts for why narrowing
 * beats rejecting here.
 *
 * Using a class DTO (`@Query() q: ReportQueryDto`) rather than per-param
 * `@Query('count') count: number` also sidesteps the NaN trap documented on
 * positiveIntOr: absent properties stay undefined, so @IsOptional behaves.
 */
export class ReportQueryDto {
  // ---- period ------------------------------------------------------------

  @ApiPropertyOptional({
    enum: RANGE_KEYS,
    default: 'last7',
    description: 'Reporting period, evaluated against IST calendar days.',
  })
  @IsOptional()
  @IsIn(RANGE_KEYS)
  range?: RangeKey;

  /**
   * Custom range endpoints as IST *calendar dates*, not instants. Pinning the
   * format stops a browser-local ISO string from silently shifting the day by
   * 5h30 — the exact class of bug date-range.ts exists to prevent. `to` is
   * inclusive of that whole IST day.
   */
  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be yyyy-MM-dd' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-07-31' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be yyyy-MM-dd' })
  to?: string;

  // ---- paging (JSON route only) -------------------------------------------

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageNumber?: number;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  count?: number;

  // ---- per-report filters --------------------------------------------------

  @ApiPropertyOptional({
    enum: OrderStatus,
    isArray: true,
    description:
      'Comma-separated. Defaults to CONFIRMED,DISPATCHED,DELIVERED (booked revenue).',
  })
  @IsOptional()
  @Transform(csvToArray)
  @IsEnum(OrderStatus, { each: true })
  status?: OrderStatus[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  wardId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  deliveryAgentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  shareCatalogId?: string;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  /**
   * Not @IsUUID: 'unassigned' is a real sentinel (UNASSIGNED_OUTLET) selecting
   * orders whose ward — and therefore serving outlet — could not be resolved.
   */
  @ApiPropertyOptional({ description: "Outlet id, or 'unassigned'." })
  @IsOptional()
  @IsString()
  outletId?: string;
}

/**
 * Export variant. Paging is absent *by construction* rather than by convention:
 * with the global ValidationPipe's `whitelist: true`, a stray `?count=10` on an
 * export URL is stripped instead of honoured. "An export is never page-limited"
 * is therefore enforced by the type, not by a comment someone can overlook.
 */
export class ReportExportQueryDto extends OmitType(ReportQueryDto, [
  'pageNumber',
  'count',
] as const) {
  @ApiProperty({ enum: ['csv', 'pdf'] })
  @IsIn(['csv', 'pdf'])
  format: 'csv' | 'pdf';
}
