// Swagger responses that the routes of versions share (spec 015, R13)
export const UNAUTHORIZED = { status: 401, description: 'Sin autenticación' };
export const FORBIDDEN = {
  status: 403,
  description: 'Solo un ADMIN puede publicar y ver versiones',
};
export const INVALID = {
  status: 400,
  description: 'Un id no es un UUID, el cuerpo o los parámetros son inválidos',
};
export const NOT_FOUND = {
  status: 404,
  description:
    'El procedimiento o la versión no existen, o la versión es de otro procedimiento (misma respuesta en todos los casos)',
};
export const UNAVAILABLE = { status: 503, description: 'La base no responde' };
