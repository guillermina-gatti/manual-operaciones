// Spec 009 (R3, PD9): lector de eventos SSE, puro e incremental. Recibe el texto de a fragmentos
// (un evento puede venir partido) y avisa cada evento completo. Ignora los comentarios (":").

export interface SseEvent {
  event: string; // "message" si el bloque no trae línea event
  data: string; // las líneas data juntas con "\n"
}

export interface SseParser {
  push(chunk: string): void;
  // Al terminar el cuerpo: un bloque sin la línea vacía final quedó cortado y se descarta.
  end(): void;
}

export function createSseParser(onEvent: (event: SseEvent) => void): SseParser {
  let buffer = '';

  function emitBlock(block: string): void {
    let name = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line === '' || line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'event') name = value;
      else if (field === 'data') data.push(value);
    }
    if (data.length > 0) onEvent({ event: name, data: data.join('\n') });
  }

  return {
    push(chunk: string) {
      buffer += chunk.replace(/\r\n?/g, '\n');
      let separator = buffer.indexOf('\n\n');
      while (separator !== -1) {
        emitBlock(buffer.slice(0, separator));
        buffer = buffer.slice(separator + 2);
        separator = buffer.indexOf('\n\n');
      }
    },
    end() {
      buffer = '';
    },
  };
}
