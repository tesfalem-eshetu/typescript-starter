export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  name: string;
  synchronize: boolean;
  logging: boolean;
}

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  database: DatabaseConfig;
}

export default (): AppConfig => ({
  nodeEnv: (process.env.NODE_ENV as AppConfig['nodeEnv']) ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    user: process.env.DB_USER ?? 'app',
    password: process.env.DB_PASSWORD ?? 'app',
    name: process.env.DB_NAME ?? 'events',
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true',
  },
});
