import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModuleAsyncOptions } from '@nestjs/typeorm';
import { DatabaseConfig } from '../config/configuration';

export const typeOrmAsyncConfig: TypeOrmModuleAsyncOptions = {
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const db = config.getOrThrow<DatabaseConfig>('database');
    return {
      type: 'postgres',
      host: db.host,
      port: db.port,
      username: db.user,
      password: db.password,
      database: db.name,
      autoLoadEntities: true,
      synchronize: db.synchronize,
      logging: db.logging,
    };
  },
};
