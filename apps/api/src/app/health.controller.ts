import { Controller, Get } from '@nestjs/common';
import { DatabaseService, type DatabaseDriver } from '../database/database.service';

interface HealthResponse {
  status: 'ok';
  database: DatabaseDriver;
}

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async getHealth(): Promise<HealthResponse> {
    await this.database.ping();
    return {
      status: 'ok',
      database: this.database.mode,
    };
  }
}
