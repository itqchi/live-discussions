import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HousesModule } from '../houses/houses.module';
import { RoomsModule } from '../rooms/rooms.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    HousesModule,
    RoomsModule,
  ],
})
export class AppModule {}
