import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity('CatalogProductVariants')
export class CatalogProductVariants {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  catalogProductId: string;

  @Column({ type: 'varchar' })
  variantId: string;

  @Column({ type: 'float' })
  price: number;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne('CatalogProducts', 'catalogVariants')
  @JoinColumn({ name: 'catalogProductId' })
  catalogProduct: any;

  @ManyToOne('ProductVariants', 'id')
  @JoinColumn({ name: 'variantId' })
  variant: any;
}
