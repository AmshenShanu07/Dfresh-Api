import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { ConstituencyType } from 'src/common/enums';

@Entity('Ward')
export class Ward {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  districtId: number;

  @Column({ type: 'varchar' })
  districtName: string;

  @Column({ type: 'enum', enum: ConstituencyType })
  constituencyType: ConstituencyType;

  @Column({ type: 'varchar' })
  localBodyId: string;

  @Column({ type: 'varchar' })
  localBodyName: string;

  @Column({ type: 'varchar' })
  wardNumber: string;

  @Column({ type: 'varchar', default: '' })
  wardName: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  isDeleted: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
