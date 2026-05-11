import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('Ward')
export class Ward {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  wardNumber: string;

  @Column({ type: 'varchar' })
  name: string;
}
