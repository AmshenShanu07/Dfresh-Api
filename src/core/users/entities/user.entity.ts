import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserTypes } from 'src/common/enums';

@Entity('User')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', unique: true })
  phone: string;

  @Column({ type: 'varchar' })
  password: string;

  @Column({ type: 'enum', enum: UserTypes, default: UserTypes.CUSTOMER })
  userType: UserTypes;

  @Column({ type: 'varchar', nullable: true, default: '' })
  email: string;

  @Column({ type: 'varchar', nullable: true, default: '' })
  address: string;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany('Staff', 'user')
  outletAgent: any[];

  @OneToMany('UserAddress', 'user')
  UserAddress: any[];

  @OneToMany('Purchase', 'supplier')
  Purchase: any[];

  @OneToMany('OrderDetails', 'user')
  OrderDetails: any[];
}

@Entity('UserAddress')
export class UserAddress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar', default: '' })
  name: string;

  @Column({ type: 'varchar', default: '' })
  address: string;

  @Column({ type: 'varchar', default: '' })
  pinCode: string;

  @Column({ type: 'varchar', default: '' })
  phone: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne('User', 'UserAddress')
  @JoinColumn({ name: 'userId' })
  user: any;
}
