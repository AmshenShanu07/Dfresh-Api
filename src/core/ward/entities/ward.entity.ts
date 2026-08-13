import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { ConstituencyType } from 'src/common/enums';
import { LocalizedText } from 'src/common/utils/localized-text';

@Entity('Ward')
export class Ward {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  districtId: number;

  @Column({ type: 'jsonb' })
  districtName: LocalizedText;

  @Column({ type: 'enum', enum: ConstituencyType })
  constituencyType: ConstituencyType;

  @Column({ type: 'varchar' })
  localBodyId: string;

  @Column({ type: 'jsonb' })
  localBodyName: LocalizedText;

  @Column({ type: 'varchar' })
  wardNumber: string;

  @Column({ type: 'jsonb' })
  wardName: LocalizedText;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  isDeleted: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
