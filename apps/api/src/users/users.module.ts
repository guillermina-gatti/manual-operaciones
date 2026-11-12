import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InvitationDeliveryService,
  LocalInvitationDeliveryService,
  UnavailableInvitationDeliveryService,
} from './invitation-delivery.service';
import { ResendInvitationDeliveryService } from './resend-invitation-delivery.service';
import { InvitationsService } from './invitations.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    InvitationsService,

    // Adaptadores disponibles para inyección.
    LocalInvitationDeliveryService,
    ResendInvitationDeliveryService,

    // Selección segura del canal de entrega.
    {
      provide: InvitationDeliveryService,
      inject: [
        ConfigService,
        LocalInvitationDeliveryService,
        ResendInvitationDeliveryService,
      ],
      useFactory: (
        configService: ConfigService,
        localDelivery: LocalInvitationDeliveryService,
        resendDelivery: ResendInvitationDeliveryService,
      ): InvitationDeliveryService => {
        const environment = configService.get<string>('NODE_ENV');

        const provider = configService
          .get<string>('INVITATION_EMAIL_PROVIDER')
          ?.trim();

        const isLocalEnvironment =
          environment === 'development' || environment === 'test';

        // Desarrollo y pruebas:
        // solo permiten el adaptador local.
        // La variable es opcional para conservar
        // compatibilidad con entornos locales existentes.
        if (isLocalEnvironment && (!provider || provider === 'local')) {
          return localDelivery;
        }

        // Producción y otros entornos no locales:
        // requieren selección explícita de Resend.
        // Las credenciales se comprueban mediante
        // assertReady() antes de crear la invitación.
        if (!isLocalEnvironment && provider === 'resend') {
          return resendDelivery;
        }

        // Configuraciones incompatibles:
        // fallar de forma segura.
        return new UnavailableInvitationDeliveryService();
      },
    },
  ],
  exports: [UsersService, InvitationsService, InvitationDeliveryService],
})
export class UsersModule {}
