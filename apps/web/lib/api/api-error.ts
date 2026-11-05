// Error de un pedido a la API, con la forma estándar de NestJS (plan 001, sección 3).
// status 0 = no hubo una respuesta válida de la API: sin conexión, o una respuesta que no es JSON.
export class ApiError extends Error {
  readonly status: number;
  readonly messages: string[];
  // Solo en el 409 de la carga: el documento que ya tiene ese archivo (F3).
  readonly existingDocumentId?: string;
  // Qué tipo de 409 es (spec 003, D7): DUPLICATE, IDENTICAL_TO_CURRENT, ARCHIVED o CONCURRENT_VERSION.
  readonly reason?: string;

  constructor(
    status: number,
    messages: string[] = [],
    existingDocumentId?: string,
    reason?: string,
  ) {
    super(messages.length > 0 ? messages.join('; ') : `Error de la API (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.messages = messages;
    this.existingDocumentId = existingDocumentId;
    this.reason = reason;
  }
}
