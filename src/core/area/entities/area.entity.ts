import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { LocalizedText } from '../../../common/utils/localized-text';

// A sub-division of a Ward, owned by exactly one outlet agent (Staff/User).
// Areas are never created standalone — they're added on the outlet-agent
// (Staff) form, so wardId/outletId are snapshotted from the agent's outlet at
// creation time rather than picked independently.
@Entity('Area')
export class Area {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'jsonb' })
  name: LocalizedText;

  @Column({ type: 'varchar' })
  wardId: string;

  @Column({ type: 'varchar' })
  outletId: string;

  // The owning outlet agent. Set once at creation and never reassigned —
  // 1 area = 1 agent is enforced by construction, not a uniqueness check.
  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  isDeleted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne('Ward')
  @JoinColumn({ name: 'wardId' })
  ward: any;

  @ManyToOne('Outlets')
  @JoinColumn({ name: 'outletId' })
  outlet: any;

  @ManyToOne('User')
  @JoinColumn({ name: 'userId' })
  user: any;
}
