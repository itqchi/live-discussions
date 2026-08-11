import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from '../config/environment';
import { DatabaseModule } from '../database/database.module';
import { HousesModule } from '../houses/houses.module';
import { RoomsModule } from '../rooms/rooms.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    DatabaseModule,
    HousesModule,
    RoomsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
