import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

type DatabaseDriver = 'memory' | 'postgres';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly driver: DatabaseDriver;
  private readonly pool: Pool | null;

  constructor(private readonly config: ConfigService) {
    this.driver = this.config.get<DatabaseDriver>('DATABASE_DRIVER') ?? 'memory';

    if (this.driver === 'memory') {
      this.pool = null;
      return;
    }

    if (this.driver !== 'postgres') {
      throw new Error(`Unsupported DATABASE_DRIVER: ${this.driver}`);
    }

    const connectionString = this.config.get<string>('DATABASE_URL');
    if (!connectionString) {
      throw new Error('DATABASE_URL is required when DATABASE_DRIVER=postgres');
    }

    this.pool = new Pool({ connectionString });
  }

  get configured(): boolean {
    return this.driver === 'postgres';
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error('PostgreSQL is not enabled');
    }

    return this.pool.query<T>(text, values);
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) {
      throw new Error('PostgreSQL is not enabled');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
