import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// Los módulos globales existentes suministran PrismaService y los guards de autenticación.
@Module({
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
