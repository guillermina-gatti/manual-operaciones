import { Module, type FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InvitationDeliveryService,
  LocalInvitationDeliveryService,
  UnavailableInvitationDeliveryService,
} from './invitation-delivery.service';
import { ResendInvitationDeliveryService } from './resend-invitation-delivery.service';
import { SesInvitationDeliveryService } from './ses-invitation-delivery.service';
import { InvitationsService } from './invitations.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * Proveedor real utilizado por UsersModule.
 * Exportado para verificar la selección mediante
 * inyección de dependencias en las pruebas.
 */
export const invitationDeliveryProvider: FactoryProvider<InvitationDeliveryService> =
  {
    provide: InvitationDeliveryService,
    inject: [
      ConfigService,
      LocalInvitationDeliveryService,
      ResendInvitationDeliveryService,
      SesInvitationDeliveryService,
    ],
    useFactory: (
      configService: ConfigService,
      localDelivery: LocalInvitationDeliveryService,
      resendDelivery: ResendInvitationDeliveryService,
      sesDelivery: SesInvitationDeliveryService,
    ): InvitationDeliveryService => {
      const environment = configService.get<string>('NODE_ENV');

      const provider = configService
        .get<string>('INVITATION_EMAIL_PROVIDER')
        ?.trim();

      const isLocalEnvironment =
        environment === 'development' || environment === 'test';

      // Solo development/test pueden generar enlaces locales.
      if (isLocalEnvironment && (!provider || provider === 'local')) {
        return localDelivery;
      }

      // Los demás entornos requieren un proveedor transaccional explícito.
      if (!isLocalEnvironment && provider === 'resend') {
        return resendDelivery;
      }

      if (!isLocalEnvironment && provider === 'ses') {
        return sesDelivery;
      }

      // Configuración incompatible: no crear invitaciones.
      return new UnavailableInvitationDeliveryService();
    },
  };

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    InvitationsService,
    LocalInvitationDeliveryService,
    ResendInvitationDeliveryService,
    SesInvitationDeliveryService,
    invitationDeliveryProvider,
  ],
  exports: [UsersService, InvitationsService, InvitationDeliveryService],
})
export class UsersModule {}
