import { createHash } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InvitationDeliveryService,
  type DeliverInvitationParams,
  type DeliveryResult,
} from './invitation-delivery.service';
import {
  buildInvitationEmailContent,
  validateSenderEmail,
} from './invitation-email-template';

const RESEND_API_URL = 'https://api.resend.com/emails';
const REQUEST_TIMEOUT_MS = 10_000;

@Injectable()
export class ResendInvitationDeliveryService extends InvitationDeliveryService {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  /**
   * Comprueba la configuración antes de crear una invitación.
   * Nunca incluye credenciales en mensajes de error.
   */
  assertReady(): void {
    this.getConfiguration();
  }

  async deliver(params: DeliverInvitationParams): Promise<DeliveryResult> {
    const { apiKey, from } = this.getConfiguration();

    // La clave es estable para esta invitación, pero no
    // expone su token en el encabezado HTTP.
    const idempotencyKey = `pispiar-invitation/${createHash('sha256')
      .update(params.token)
      .digest('hex')}`;

    const { subject, text } = buildInvitationEmailContent(params.invitationUrl);

    try {
      const response = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          from,
          to: [params.email],
          subject,
          text,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error('Resend rechazó la solicitud');
      }

      const payload: unknown = await response.json();

      if (
        typeof payload !== 'object' ||
        payload === null ||
        !('id' in payload) ||
        typeof payload.id !== 'string' ||
        payload.id.length === 0
      ) {
        throw new Error('Respuesta inválida de Resend');
      }

      // El proveedor aceptó el envío.
      // Esto no garantiza entrega en bandeja de entrada.
      return {
        delivered: true,
        channel: 'email',
      };
    } catch {
      // No propagar respuestas externas ni URLs con tokens.
      throw new ServiceUnavailableException(
        'El servicio de correo no pudo aceptar la invitación',
      );
    }
  }

  private getConfiguration(): {
    apiKey: string;
    from: string;
  } {
    const provider = this.configService.get<string>(
      'INVITATION_EMAIL_PROVIDER',
    );

    const apiKey = this.configService.get<string>('RESEND_API_KEY')?.trim();

    if (provider !== 'resend' || !apiKey) {
      throw new ServiceUnavailableException(
        'El proveedor de correo no está configurado',
      );
    }

    const from = validateSenderEmail(
      this.configService.get<string>('INVITATION_EMAIL_FROM'),
    );

    return { apiKey, from };
  }
}
