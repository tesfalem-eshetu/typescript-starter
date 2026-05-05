import { Column, Entity, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { Event } from '../../events/entities/event.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @ManyToMany('Event', (event: Event) => event.invitees)
  events!: Event[];
}
