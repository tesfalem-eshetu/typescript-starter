import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  // The `events` inverse side of the User <-> Event many-to-many relation
  // is added together with the Event entity to keep both sides of the
  // relation introduced atomically.
}
