// Test de ejemplo: comprueba que Vitest, jsdom, React, jest-dom y el atajo @/ están configurados (T01).
import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import nextConfig from '@/next.config';

test('resuelve el atajo @/ de tsconfig.json', () => {
  expect(nextConfig.cacheComponents).toBe(true);
});

test('renderiza un botón en el DOM simulado', () => {
  render(<button type="button">Cargar documento</button>);

  expect(
    screen.getByRole('button', { name: 'Cargar documento' }),
  ).toBeInTheDocument();
});
