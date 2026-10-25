/* Para correr TypeScript con ts-node (seed-fixtures.ts): el cliente generado por Prisma importa
"./internal/class.js", que en el código fuente es class.ts. Hace lo mismo que el moduleNameMapper
de test/jest-e2e.json: si un import relativo .js no existe, prueba con el .ts. */

const Module = require('node:module');

const resolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, parent, ...rest) {
  try {
    return resolveFilename.call(this, request, parent, ...rest);
  } catch (error) {
    const relativeJs = request.startsWith('.') && request.endsWith('.js');
    if (!relativeJs || error.code !== 'MODULE_NOT_FOUND') throw error;
    return resolveFilename.call(this, request.replace(/\.js$/, '.ts'), parent, ...rest);
  }
};
