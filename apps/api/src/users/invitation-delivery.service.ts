import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Role } from '../common/auth';

export interface DeliverInvitationParams {
  email: string;
  role: Role;
  token: string;
  invitationUrl: string;
}

export interface DeliveryResult {
  /**
   * Indica si la invitación fue efectivamente despachada al destinatario por un canal externo (ej. correo).
   * Para adaptadores locales en desarrollo/test es false ya que solo se genera el enlace para inspección local.
   */
  delivered: boolean;
  channel: 'local' | 'email';
  invitationUrl?: string;
}

export abstract class InvitationDeliveryService {
  /**
   * Comprueba la disponibilidad del canal de entrega.
   * En producción o entornos sin proveedor real configurado, debe fallar antes de persistir la invitación.
   */
  abstract assertReady(): void;

  /**
   * Entrega la invitación al destinatario a través del canal configurado.
   * Cada invocación es independiente y devuelve su propio resultado sin memoria compartida.
   */
  abstract deliver(params: DeliverInvitationParams): Promise<DeliveryResult>;
}

@Injectable()
export class LocalInvitationDeliveryService implements InvitationDeliveryService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Comprueba la disponibilidad del canal de entrega local.
   * Se permite el adaptador local exclusivamente cuando NODE_ENV sea 'development' o 'test'.
   * En cualquier otro entorno (production, staging, valores desconocidos o no definidos),
   * rechaza con ServiceUnavailableException al no existir un proveedor real de entrega.
   */
  assertReady(): void {
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const isLocalAllowed = nodeEnv === 'development' || nodeEnv === 'test';

    if (!isLocalAllowed) {
      throw new ServiceUnavailableException(
        'El servicio de entrega de invitaciones no está configurado en este entorno',
      );
    }
  }

  /**
   * En desarrollo y pruebas, no envía correos externos ni escribe tokens en consola.
   * Devuelve el resultado aislado correspondiente a la solicitud en curso.
   * Semántica: delivered es false porque el adaptador local no despacha un correo al destinatario.
   */
  async deliver(params: DeliverInvitationParams): Promise<DeliveryResult> {
    this.assertReady();

    return {
      delivered: false,
      channel: 'local',
      invitationUrl: params.invitationUrl,
    };
  }
}
