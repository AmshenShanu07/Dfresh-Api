import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinColumn,
} from 'typeorm';

@Entity('Products')
export class Products {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar' })
  description: string;

  @Column({ type: 'text', array: true, default: [] })
  image: string[];

  @Column({ type: 'varchar' })
  categoryId: string;

  @Column({ type: 'varchar', default: '' })
  catalogId: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  isDeleted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne('Category', 'Products')
  @JoinColumn({ name: 'categoryId' })
  category: any;

  @OneToMany('CatalogProducts', 'product')
  CatalogProducts: any[];

  @OneToMany('Purchase', 'product')
  Purchase: any[];

  @OneToMany('ShareCatalogProducts', 'product')
  ShareCatalogProducts: any[];

  @ManyToMany('Outlets', 'products')
  Outlets: any[];

  @OneToMany('OrderItems', 'product')
  OrderItems: any[];
}
