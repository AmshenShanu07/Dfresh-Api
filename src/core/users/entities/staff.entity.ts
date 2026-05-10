import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity('Staff')
export class Staff {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar' })
  outletId: string;

  @Column({ type: 'boolean', default: false })
  isDeleted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne('User', 'outletAgent')
  @JoinColumn({ name: 'userId' })
  user: any;

  @ManyToOne('Outlets', 'OutletAgent')
  @JoinColumn({ name: 'outletId' })
  outlet: any;
}
