import { ServiceUnavailableException } from '@nestjs/common';

export interface InvitationEmailContent {
  subject: string;
  text: string;
}

/**
 * Valida que el remitente configurado tenga formato "correo@dominio.com"
 * o "Nombre <correo@dominio.com>" sin inyección de cabeceras (CR/LF).
 */
export function validateSenderEmail(rawFrom: string | undefined): string {
  const from = rawFrom?.trim();
  if (!from) {
    throw new ServiceUnavailableException(
      'El proveedor de correo no está configurado',
    );
  }

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

  return from;
}

/**
 * Construye el asunto y cuerpo de texto plano compartidos para las invitaciones
 * enviadas por cualquier adaptador transaccional (AWS SES o Resend).
 */
export function buildInvitationEmailContent(
  invitationUrl: string,
): InvitationEmailContent {
  return {
    subject: 'Tu invitación para registrarte en PispIAr',
    text: [
      'Hola,',
      '',
      'Te invitaron a registrarte en PispIAr.',
      '',
      'Para crear tu cuenta, abrí este enlace:',
      invitationUrl,
      '',
      'El enlace es de un solo uso y vence a las 48 horas.',
      '',
      'Si no esperabas esta invitación, ignorá el mensaje.',
      '',
      'Equipo PispIAr',
    ].join('\n'),
  };
}
