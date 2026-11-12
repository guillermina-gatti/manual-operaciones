// Dirección del backend al que Next reenvía /api (plan 002, sección 2).
// Se lee solo en el servidor de Next: sin el prefijo NEXT_PUBLIC_, no termina en el JavaScript del navegador.
export const API_URL_ENV_VAR = 'API_URL';

// La API escucha en el puerto 3000 por defecto (apps/api/src/main.ts); la web corre en el 3001 (D3).
export const DEFAULT_DEV_API_URL = 'http://localhost:3000';

type Env = Partial<Record<string, string>>;

export function resolveApiUrl(env: Env): string {
  const value = env[API_URL_ENV_VAR]?.trim();
  if (value) return value.replace(/\/+$/, '');

  if (env.NODE_ENV === 'production') {
    throw new Error(
      `Falta ${API_URL_ENV_VAR}: la dirección del backend al que se reenvía /api`,
    );
  }
  return DEFAULT_DEV_API_URL;
}
