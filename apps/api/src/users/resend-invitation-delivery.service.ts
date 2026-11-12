import { createHash } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InvitationDeliveryService,
  type DeliverInvitationParams,
  type DeliveryResult,
} from './invitation-delivery.service';

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

    const message = [
      'Hola,',
      '',
      'Te invitaron a registrarte en PispIAr.',
      '',
      'Para crear tu cuenta, abrí este enlace:',
      params.invitationUrl,
      '',
      'El enlace es de un solo uso y vence a las 48 horas.',
      '',
      'Si no esperabas esta invitación, ignorá el mensaje.',
      '',
      'Equipo PispIAr',
    ].join('\n');

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
          subject: 'Tu invitación para registrarte en PispIAr',
          text: message,
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

    const from = this.configService
      .get<string>('INVITATION_EMAIL_FROM')
      ?.trim();

    if (provider !== 'resend' || !apiKey || !from) {
      throw new ServiceUnavailableException(
        'El proveedor de correo no está configurado',
      );
    }

    // Admite "correo@dominio.com" y
    // "PispIAr <correo@dominio.com>".
    let email = from;

    if (from.includes('<') || from.includes('>')) {
      const match = from.match(/^[^<>\r\n]+<([^<>\r\n]+)>$/);

      if (!match) {
        throw new ServiceUnavailableException(
          'El remitente del correo no es válido',
        );
      }

      email = match[1].trim();
    }

    if (
      /[\r\n]/.test(from) ||
      !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)
    ) {
      throw new ServiceUnavailableException(
        'El remitente del correo no es válido',
      );
    }

    return { apiKey, from };
  }
}
