// Se ejecuta antes de cada archivo de test.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sin los globals de Vitest, Testing Library no limpia sola: se desmonta lo renderizado después de cada test.
afterEach(() => {
  cleanup();
});
