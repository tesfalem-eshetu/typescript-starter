import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

export interface PostgresConnection {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface StartedPostgres {
  container: StartedPostgreSqlContainer;
  connection: PostgresConnection;
}

export async function startPostgres(): Promise<StartedPostgres> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('events_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  return {
    container,
    connection: {
      host: container.getHost(),
      port: container.getPort(),
      user: container.getUsername(),
      password: container.getPassword(),
      database: container.getDatabase(),
    },
  };
}
