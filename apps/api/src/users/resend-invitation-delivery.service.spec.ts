import { createHash } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResendInvitationDeliveryService } from './resend-invitation-delivery.service';

const TOKEN = 'token-ficticio-de-prueba';

const INVITATION = {
  email: 'invitada@example.com',
  role: 'EMPLOYEE' as const,
  token: TOKEN,
  invitationUrl: `https://pispiar.example/registro#token=${TOKEN}`,
};

const BASE_CONFIG: Record<string, string | undefined> = {
  INVITATION_EMAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 're_clave_ficticia',
  INVITATION_EMAIL_FROM: 'PispIAr <invitaciones@example.com>',
};

function createService(
  overrides: Record<string, string | undefined> = {},
): ResendInvitationDeliveryService {
  const values = { ...BASE_CONFIG, ...overrides };

  const configService = {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;

  return new ResendInvitationDeliveryService(configService);
}

function acceptedResponse(body: unknown = { id: 'email_123' }): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

describe('ResendInvitationDeliveryService (A-INV-EMAIL.4a)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('acepta una configuración válida', () => {
    const service = createService();

    expect(() => service.assertReady()).not.toThrow();
  });

  it.each([
    ['proveedor local', { INVITATION_EMAIL_PROVIDER: 'local' }],
    ['proveedor ausente', { INVITATION_EMAIL_PROVIDER: undefined }],
    ['API key vacía', { RESEND_API_KEY: '   ' }],
    ['remitente ausente', { INVITATION_EMAIL_FROM: undefined }],
    ['remitente inválido', { INVITATION_EMAIL_FROM: 'correo-invalido' }],
    [
      'intento de inyección de encabezados',
      {
        INVITATION_EMAIL_FROM:
          'PispIAr <invitaciones@example.com>\r\nBcc: atacante@example.com',
      },
    ],
  ])('rechaza %s antes de enviar correos', async (_name, overrides) => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(acceptedResponse());

    const service = createService(overrides);

    expect(() => service.assertReady()).toThrow(ServiceUnavailableException);

    await expect(service.deliver(INVITATION)).rejects.toThrow(
      ServiceUnavailableException,
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envía una invitación y devuelve el resultado esperado', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(acceptedResponse());

    const result = await createService().deliver(INVITATION);

    expect(result).toEqual({
      delivered: true,
      channel: 'email',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toBe('https://api.resend.com/emails');
    expect(options?.method).toBe('POST');
    expect(options?.signal).toBeInstanceOf(AbortSignal);

    const headers = options?.headers as Record<string, string>;

    expect(headers.Authorization).toBe('Bearer re_clave_ficticia');
    expect(headers['Content-Type']).toBe('application/json');

    const expectedKey = `pispiar-invitation/${createHash('sha256')
      .update(TOKEN)
      .digest('hex')}`;

    expect(headers['Idempotency-Key']).toBe(expectedKey);
    expect(headers['Idempotency-Key']).not.toContain(TOKEN);

    if (typeof options?.body !== 'string') {
      throw new Error('Se esperaba un cuerpo JSON en la solicitud');
    }

    const body = JSON.parse(options.body) as {
      from: string;
      to: string[];
      subject: string;
      text: string;
    };

    expect(body.from).toBe('PispIAr <invitaciones@example.com>');
    expect(body.to).toEqual(['invitada@example.com']);
    expect(body.subject).toContain('PispIAr');
    expect(body.text).toContain(INVITATION.invitationUrl);
    expect(body.text).toContain('48 horas');
  });

  it('usa la misma clave de idempotencia para un mismo token', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(acceptedResponse());

    const service = createService();

    await service.deliver(INVITATION);
    await service.deliver(INVITATION);

    const anotherInvitation = {
      ...INVITATION,
      token: 'otro-token-ficticio',
      invitationUrl:
        'https://pispiar.example/registro#token=otro-token-ficticio',
    };

    await service.deliver(anotherInvitation);

    const keys = fetchMock.mock.calls.map(([, options]) => {
      const headers = options?.headers as Record<string, string>;
      return headers['Idempotency-Key'];
    });

    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).not.toBe(keys[2]);
  });

  it.each([
    ['HTTP rechazado', false, { message: 'Error externo' }],
    ['respuesta sin ID', true, {}],
    ['ID vacío', true, { id: '' }],
  ])('rechaza %s como fallo de entrega', async (_name, ok, body) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok,
      json: async () => body,
    } as Response);

    await expect(createService().deliver(INVITATION)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('oculta los detalles sensibles de los errores de red', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(
        new Error(`Error externo: ${TOKEN} / ${BASE_CONFIG.RESEND_API_KEY}`),
      );

    await expect(createService().deliver(INVITATION)).rejects.toMatchObject({
      message: 'El servicio de correo no pudo aceptar la invitación',
    });
  });
});
