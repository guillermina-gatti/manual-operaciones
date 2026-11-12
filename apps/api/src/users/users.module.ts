import { Module } from '@nestjs/common';
import {
  InvitationDeliveryService,
  LocalInvitationDeliveryService,
} from './invitation-delivery.service';
import { InvitationsService } from './invitations.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// Los módulos globales existentes suministran PrismaService, ConfigService y los guards de autenticación.
@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    InvitationsService,
    {
      provide: InvitationDeliveryService,
      useClass: LocalInvitationDeliveryService,
    },
  ],
  exports: [UsersService, InvitationsService, InvitationDeliveryService],
})
export class UsersModule {}
