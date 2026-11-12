/* Guarda del seed de demostración (spec 016, P1): solo desarrollo y solo localhost, como
prisma/seed.ts. Así no corre contra producción ni contra una base de AWS. */

// Devuelve el nombre de la base si es seguro escribir; si no, lanza un error claro.
export function assertDevelopmentDatabase(
  url: string | undefined,
  nodeEnv: string | undefined,
): string {
  if (nodeEnv === 'production') {
    throw new Error('El seed de demostración no corre con NODE_ENV=production');
  }
  if (!url) {
    throw new Error('Falta DATABASE_URL');
  }
  const { hostname, pathname } = new URL(url);
  if (hostname !== 'localhost') {
    throw new Error(
      `El seed de demostración solo corre contra una base en localhost, no en "${hostname}"`,
    );
  }
  return decodeURIComponent(pathname.replace(/^\//, ''));
}
