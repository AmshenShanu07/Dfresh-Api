import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserLanguage, UserTypes } from 'src/common/enums';

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

  // The language this customer chats in. NULL means they have never been asked
  // — that is what makes the onboarding language prompt fire exactly once.
  // Everywhere else a NULL reads as English.
  @Column({ type: 'enum', enum: UserLanguage, nullable: true, default: null })
  language: UserLanguage | null;

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
  landmark: string;

  @Column({ type: 'varchar', default: '' })
  pinCode: string;

  @Column({ type: 'varchar', default: '' })
  phone: string;

  @Column({ type: 'varchar', nullable: true, default: null })
  wardId: string;

  // The area (sub-division of the ward) the customer picked, if the ward had
  // any configured at the time. Null when the ward had none, or for
  // addresses saved before this feature existed.
  @Column({ type: 'varchar', nullable: true, default: null })
  areaId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne('User', 'UserAddress')
  @JoinColumn({ name: 'userId' })
  user: any;
}
