import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
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

const REQUEST_TIMEOUT_MS = 10_000;
const AWS_REGION_FORMAT_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*-\d+$/;

export type SesClientFactory = (region: string) => Pick<SESv2Client, 'send'>;

/**
 * Adaptador de entrega de invitaciones mediante AWS SES v2.
 * Utiliza la cadena de credenciales por defecto del SDK (IAM Instance Profile en EC2).
 */
@Injectable()
export class SesInvitationDeliveryService extends InvitationDeliveryService {
  private readonly clients = new Map<string, Pick<SESv2Client, 'send'>>();
  private readonly createClient: SesClientFactory;

  constructor(
    private readonly configService: ConfigService,
    createClient?: SesClientFactory,
  ) {
    super();
    this.createClient =
      createClient ?? ((region: string) => new SESv2Client({ region }));
  }

  /**
   * Comprueba la configuración antes de crear o persistir una invitación.
   */
  assertReady(): void {
    this.getConfiguration();
  }

  async deliver(params: DeliverInvitationParams): Promise<DeliveryResult> {
    const { region, from } = this.getConfiguration();
    const { subject, text } = buildInvitationEmailContent(params.invitationUrl);
    const client = this.getClient(region);

    try {
      const response = await client.send(
        new SendEmailCommand({
          FromEmailAddress: from,
          Destination: {
            ToAddresses: [params.email],
          },
          Content: {
            Simple: {
              Subject: {
                Data: subject,
                Charset: 'UTF-8',
              },
              Body: {
                Text: {
                  Data: text,
                  Charset: 'UTF-8',
                },
              },
            },
          },
        }),
        { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
      );

      if (
        typeof response.MessageId !== 'string' ||
        response.MessageId.length === 0
      ) {
        throw new Error('Respuesta inválida de AWS SES');
      }

      return {
        delivered: true,
        channel: 'email',
      };
    } catch {
      // No propagar errores del SDK, ARNs ni URLs con tokens.
      throw new ServiceUnavailableException(
        'El servicio de correo no pudo aceptar la invitación',
      );
    }
  }

  private getClient(region: string): Pick<SESv2Client, 'send'> {
    let client = this.clients.get(region);
    if (!client) {
      client = this.createClient(region);
      this.clients.set(region, client);
    }
    return client;
  }

  private getConfiguration(): {
    region: string;
    from: string;
  } {
    const provider = this.configService.get<string>(
      'INVITATION_EMAIL_PROVIDER',
    );
    const sesRegion = this.configService.get<string>('AWS_SES_REGION')?.trim();
    const fallbackRegion = this.configService.get<string>('AWS_REGION')?.trim();
    const region = sesRegion || fallbackRegion;

    if (provider !== 'ses' || !region) {
      throw new ServiceUnavailableException(
        'El proveedor de correo no está configurado',
      );
    }

    if (!AWS_REGION_FORMAT_REGEX.test(region)) {
      throw new ServiceUnavailableException(
        'La región de AWS SES no es válida',
      );
    }

    const from = validateSenderEmail(
      this.configService.get<string>('INVITATION_EMAIL_FROM'),
    );

    return { region, from };
  }
}
