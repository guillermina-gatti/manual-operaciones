// jsdom no implementa showModal() ni close(): se simulan con lo mínimo que hace el navegador (el
// atributo open y el evento close). El foco atrapado y Escape reales los pone el navegador.
import { afterEach, beforeEach, vi } from 'vitest';

export function simulateDialogs() {
  const original = {
    showModal: HTMLDialogElement.prototype.showModal,
    close: HTMLDialogElement.prototype.close,
  };

  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    });
  });

  afterEach(() => {
    HTMLDialogElement.prototype.showModal = original.showModal;
    HTMLDialogElement.prototype.close = original.close;
  });
}
