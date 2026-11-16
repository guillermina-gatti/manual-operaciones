import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SesInvitationDeliveryService,
  type SesClientFactory,
} from './ses-invitation-delivery.service';

const TOKEN = 'token-ficticio-de-prueba';

const INVITATION = {
  email: 'invitada@example.com',
  role: 'EMPLOYEE' as const,
  token: TOKEN,
  invitationUrl: `https://pispiar.example/registro#token=${TOKEN}`,
};

const BASE_CONFIG: Record<string, string | undefined> = {
  INVITATION_EMAIL_PROVIDER: 'ses',
  AWS_REGION: 'us-east-1',
  AWS_SES_REGION: '',
  INVITATION_EMAIL_FROM: 'PispIAr <invitaciones@example.com>',
};

function createService(
  overrides: Record<string, string | undefined> = {},
  sendMock = jest.fn().mockResolvedValue({ MessageId: 'ses-msg-123' }),
): {
  service: SesInvitationDeliveryService;
  sendMock: jest.Mock;
  factoryMock: jest.Mock<ReturnType<SesClientFactory>, [string]>;
} {
  const values = { ...BASE_CONFIG, ...overrides };
  const configService = {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;

  const factoryMock = jest.fn<ReturnType<SesClientFactory>, [string]>(() => ({
    send: sendMock,
  }));
  const service = new SesInvitationDeliveryService(configService, factoryMock);

  return { service, sendMock, factoryMock };
}

describe('SesInvitationDeliveryService (HU30.M2)', () => {
  it('acepta configuración válida con fallback a AWS_REGION y con AWS_SES_REGION explícita', () => {
    expect(() => createService().service.assertReady()).not.toThrow();
    expect(() =>
      createService({ AWS_SES_REGION: 'sa-east-1' }).service.assertReady(),
    ).not.toThrow();
    expect(() =>
      createService({ AWS_SES_REGION: 'ap2-south-1' }).service.assertReady(),
    ).not.toThrow();
  });

  it.each([
    ['proveedor distinto de ses', { INVITATION_EMAIL_PROVIDER: 'local' }],
    ['proveedor ausente', { INVITATION_EMAIL_PROVIDER: undefined }],
    ['sin región efectiva', { AWS_REGION: '', AWS_SES_REGION: '   ' }],
    ['región inválida', { AWS_SES_REGION: 'region-invalida' }],
    ['región sin dígito final (us-east)', { AWS_SES_REGION: 'us-east' }],
    ['región en mayúsculas (US-EAST-1)', { AWS_SES_REGION: 'US-EAST-1' }],
    ['región con sufijo extra (us-east-1-extra)', { AWS_SES_REGION: 'us-east-1-extra' }],
    ['remitente vacío', { INVITATION_EMAIL_FROM: '   ' }],
    ['remitente sin dominio', { INVITATION_EMAIL_FROM: 'sin-arroba' }],
    ['remitente con CR/LF', { INVITATION_EMAIL_FROM: 'a@example.com\r\nBcc: x@y.com' }],
  ])('rechaza %s en assertReady', (_name, overrides) => {
    const { service } = createService(overrides);
    expect(() => service.assertReady()).toThrow(ServiceUnavailableException);
  });

  it('envía la invitación vía SendEmailCommand en la región efectiva y devuelve channel email', async () => {
    const { service, sendMock, factoryMock } = createService({
      AWS_REGION: 'sa-east-1',
      AWS_SES_REGION: 'us-east-1',
    });

    const result = await service.deliver(INVITATION);

    expect(result).toEqual({
      delivered: true,
      channel: 'email',
    });
    expect(factoryMock).toHaveBeenCalledWith('us-east-1');
    expect(sendMock).toHaveBeenCalledTimes(1);

    const [command, options] = sendMock.mock.calls[0] as [
      SendEmailCommand,
      { abortSignal?: AbortSignal },
    ];
    expect(command).toBeInstanceOf(SendEmailCommand);
    expect(command.input).toEqual({
      FromEmailAddress: 'PispIAr <invitaciones@example.com>',
      Destination: {
        ToAddresses: ['invitada@example.com'],
      },
      Content: {
        Simple: {
          Subject: {
            Data: 'Tu invitación para registrarte en PispIAr',
            Charset: 'UTF-8',
          },
          Body: {
            Text: {
              Data: expect.stringContaining(INVITATION.invitationUrl),
              Charset: 'UTF-8',
            },
          },
        },
      },
    });
    expect(options?.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ['respuesta sin MessageId', {}],
    ['MessageId vacío', { MessageId: '' }],
  ])('rechaza %s como fallo de entrega', async (_name, response) => {
    const sendMock = jest.fn().mockResolvedValue(response);
    const { service } = createService({}, sendMock);

    await expect(service.deliver(INVITATION)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('sanitiza errores del SDK de AWS SES sin exponer tokens ni URLs', async () => {
    const sendMock = jest
      .fn()
      .mockRejectedValue(
        new Error(`MessageRejected for ${INVITATION.invitationUrl} (${TOKEN})`),
      );
    const { service } = createService({}, sendMock);

    await expect(service.deliver(INVITATION)).rejects.toMatchObject({
      message: 'El servicio de correo no pudo aceptar la invitación',
    });
  });

  it('sanitiza errores de timeout/AbortError sin filtrar URLs, tokens ni detalles internos', async () => {
    const timeoutError = Object.assign(
      new Error(
        `The operation was aborted due to timeout for ${INVITATION.invitationUrl} (${TOKEN})`,
      ),
      { name: 'TimeoutError' },
    );
    const sendMock = jest.fn().mockRejectedValue(timeoutError);
    const { service } = createService({}, sendMock);

    let caught: unknown;
    try {
      await service.deliver(INVITATION);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ServiceUnavailableException);
    const message = (caught as ServiceUnavailableException).message;
    expect(message).toBe('El servicio de correo no pudo aceptar la invitación');
    expect(message).not.toContain(TOKEN);
    expect(message).not.toContain(INVITATION.invitationUrl);
    expect(message).not.toContain('TimeoutError');
  });
});
