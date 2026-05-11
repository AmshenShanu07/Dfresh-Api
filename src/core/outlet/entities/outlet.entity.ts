import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  ManyToMany,
  JoinTable,
} from 'typeorm';

@Entity('Outlets')
export class Outlets {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: true, default: '' })
  name: string;

  @Column({ type: 'varchar', nullable: true, default: '' })
  address: string;

  @Column({ type: 'varchar', nullable: true, default: '' })
  phone: string;

  @Column({ type: 'varchar' })
  location: string;

  @Column({ type: 'boolean', default: false })
  isSalesEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  isDeleted: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'float' })
  commission: number;

  @Column({ type: 'varchar', nullable: true, default: null })
  wardId: string;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany('Staff', 'outlet')
  OutletAgent: any[];

  @OneToMany('Purchase', 'outlet')
  Purchase: any[];

  @ManyToMany('Products', 'Outlets')
  @JoinTable({
    name: '_OutletsToProducts',
    joinColumn: { name: 'A', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'B', referencedColumnName: 'id' },
  })
  products: any[];
}
