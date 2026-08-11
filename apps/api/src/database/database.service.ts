import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

export type DatabaseDriver = 'memory' | 'postgres';

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

    const connectionString = this.config.get<string>('DATABASE_URL')?.trim();
    if (!connectionString) {
      throw new Error('DATABASE_URL is required when DATABASE_DRIVER=postgres');
    }

    this.pool = new Pool({
      connectionString,
      application_name: 'live-discussions-api',
    });
  }

  get configured(): boolean {
    return this.driver === 'postgres';
  }

  get mode(): DatabaseDriver {
    return this.driver;
  }

  async ping(): Promise<void> {
    if (!this.pool) return;
    await this.pool.query('SELECT 1');
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<QueryResult<T>> {
    const pool = this.requirePool();
    return pool.query<T>(text, values);
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.requirePool().connect();

    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the business/database error that caused the transaction to fail.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  private requirePool(): Pool {
    if (!this.pool) throw new Error('PostgreSQL is not enabled');
    return this.pool;
  }
}
