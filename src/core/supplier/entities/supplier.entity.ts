import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('Supplier')
export class Supplier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar' })
  supplierCode: string;

  @Column({ type: 'varchar', nullable: true, default: '' })
  phone: string;

  @Column({ type: 'varchar', nullable: true, default: '' })
  email: string;

  @Column({ type: 'varchar', nullable: true, default: '' })
  address: string;

  @Column({ type: 'boolean', default: false })
  isDeleted: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
