import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  InvitationDeliveryService,
  LocalInvitationDeliveryService,
  UnavailableInvitationDeliveryService,
} from './invitation-delivery.service';
import { ResendInvitationDeliveryService } from './resend-invitation-delivery.service';
import { SesInvitationDeliveryService } from './ses-invitation-delivery.service';
import { invitationDeliveryProvider } from './users.module';

interface TestConfig {
  nodeEnv?: string;
  provider?: string;
  apiKey?: string;
  awsRegion?: string;
  awsSesRegion?: string;
  from?: string;
}

describe('UsersModule - selección del proveedor (A-INV-EMAIL.4b / HU30.M3)', () => {
  const modules: TestingModule[] = [];

  async function resolveDelivery(
    options: TestConfig = {},
  ): Promise<InvitationDeliveryService> {
    const values: Record<string, string | undefined> = {
      NODE_ENV: options.nodeEnv,
      INVITATION_EMAIL_PROVIDER: options.provider,
      RESEND_API_KEY: options.apiKey ?? 're_clave_ficticia',
      AWS_REGION: options.awsRegion ?? 'us-east-1',
      AWS_SES_REGION: options.awsSesRegion ?? '',
      INVITATION_EMAIL_FROM:
        options.from ?? 'PispIAr <invitaciones@example.com>',
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: (key: string): string | undefined => values[key],
          },
        },
        LocalInvitationDeliveryService,
        ResendInvitationDeliveryService,
        SesInvitationDeliveryService,
        invitationDeliveryProvider,
      ],
    }).compile();

    modules.push(moduleRef);

    return moduleRef.get<InvitationDeliveryService>(InvitationDeliveryService);
  }

  afterEach(async () => {
    for (const moduleRef of modules) {
      await moduleRef.close();
    }
    modules.length = 0;
  });

  describe('Entornos locales', () => {
    it.each([
      ['development', undefined],
      ['development', 'local'],
      ['test', undefined],
      ['test', 'local'],
    ])(
      'selecciona el adaptador local en %s con proveedor %s',
      async (nodeEnv, provider) => {
        const delivery = await resolveDelivery({
          nodeEnv,
          provider,
        });

        expect(delivery).toBeInstanceOf(LocalInvitationDeliveryService);

        expect(() => delivery.assertReady()).not.toThrow();
      },
    );
  });

  describe('Entornos no locales', () => {
    it.each(['production', 'staging', 'qa', undefined])(
      'selecciona Resend en entorno %s cuando está configurado',
      async (nodeEnv) => {
        const delivery = await resolveDelivery({
          nodeEnv,
          provider: 'resend',
        });

        expect(delivery).toBeInstanceOf(ResendInvitationDeliveryService);

        expect(() => delivery.assertReady()).not.toThrow();
      },
    );

    it.each(['production', 'staging', 'qa', undefined])(
      'selecciona AWS SES en entorno %s cuando está configurado',
      async (nodeEnv) => {
        const delivery = await resolveDelivery({
          nodeEnv,
          provider: 'ses',
        });

        expect(delivery).toBeInstanceOf(SesInvitationDeliveryService);

        expect(() => delivery.assertReady()).not.toThrow();
      },
    );
  });

  describe('Configuraciones incompatibles', () => {
    it.each([
      ['production', undefined],
      ['production', 'local'],
      ['staging', undefined],
      ['staging', 'local'],
      ['development', 'resend'],
      ['test', 'resend'],
      ['development', 'ses'],
      ['test', 'ses'],
      ['development', 'desconocido'],
      ['test', 'desconocido'],
      [undefined, undefined],
    ])('rechaza NODE_ENV=%s y proveedor=%s', async (nodeEnv, provider) => {
      const delivery = await resolveDelivery({
        nodeEnv,
        provider,
      });

      expect(delivery).toBeInstanceOf(UnavailableInvitationDeliveryService);

      expect(() => delivery.assertReady()).toThrow(ServiceUnavailableException);
    });
  });

  describe('Validación de credenciales', () => {
    it('rechaza Resend cuando falta la API key', async () => {
      const delivery = await resolveDelivery({
        nodeEnv: 'production',
        provider: 'resend',
        apiKey: '   ',
      });

      expect(delivery).toBeInstanceOf(ResendInvitationDeliveryService);

      expect(() => delivery.assertReady()).toThrow(ServiceUnavailableException);
    });

    it('rechaza Resend cuando falta el remitente', async () => {
      const delivery = await resolveDelivery({
        nodeEnv: 'production',
        provider: 'resend',
        from: '',
      });

      expect(delivery).toBeInstanceOf(ResendInvitationDeliveryService);

      expect(() => delivery.assertReady()).toThrow(ServiceUnavailableException);
    });

    it('rechaza AWS SES cuando falta la región efectiva', async () => {
      const delivery = await resolveDelivery({
        nodeEnv: 'production',
        provider: 'ses',
        awsRegion: '',
        awsSesRegion: '   ',
      });

      expect(delivery).toBeInstanceOf(SesInvitationDeliveryService);

      expect(() => delivery.assertReady()).toThrow(ServiceUnavailableException);
    });

    it('rechaza AWS SES cuando falta el remitente', async () => {
      const delivery = await resolveDelivery({
        nodeEnv: 'production',
        provider: 'ses',
        from: '',
      });

      expect(delivery).toBeInstanceOf(SesInvitationDeliveryService);

      expect(() => delivery.assertReady()).toThrow(ServiceUnavailableException);
    });
  });
});
