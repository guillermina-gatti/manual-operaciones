/* Spec 010 (T08): siembra de procedimientos, versiones, pasos y ejecuciones para la integración del
contexto del paso, y lectura de la transmisión SSE. Escribe en tablas de la pareja B solo en la base
de tests (manual_test), y borra lo que crea. */

import type { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import { EmbeddingProvider } from '../../src/processing/ports/embedding-provider';
import { FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import type { PrismaService } from '../../src/prisma/prisma.service';

// Todos los textos tienen el mismo vector: la distancia de la pregunta a cada fragmento es 0.
export const VECTOR = Array.from(
  { length: 768 },
  (_, i) => (i % 7) / 10 + 0.01,
);

export class FixedEmbeddings extends EmbeddingProvider {
  async embedMany(texts: string[]): Promise<number[][]> {
    return texts.map(() => [...VECTOR]);
  }
}

export interface StreamEvent {
  event: string;
  data: Record<string, unknown>;
}

// Junta el cuerpo SSE como texto (supertest no lo interpreta).
export const asText = (
  res: IncomingMessage,
  done: (err: Error | null, body: string) => void,
) => {
  let body = '';
  res.setEncoding('utf8');
  res.on('data', (chunk: string) => (body += chunk));
  res.on('end', () => done(null, body));
};

export function parseEvents(body: string): StreamEvent[] {
  return body
    .split('\n\n')
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      const lines = block.split('\n');
      const event = lines
        .find((l) => l.startsWith('event: '))!
        .slice('event: '.length);
      const data = lines
        .find((l) => l.startsWith('data: '))!
        .slice('data: '.length);
      return { event, data: JSON.parse(data) as Record<string, unknown> };
    });
}

type Status = 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';

export interface SeededProcedure {
  procedureId: string;
  // Por número de versión: su id y los ids de sus pasos, en orden.
  versions: Record<number, { id: string; stepIds: string[] }>;
}

// Un procedimiento con sus áreas y versiones; cada versión con estos pasos (título y descripción).
export async function seedProcedure(
  prisma: PrismaService,
  opts: {
    areaIds: string[];
    versions: {
      versionNumber: number;
      status: Status;
      title?: string;
      steps: { title: string; description?: string }[];
    }[];
  },
): Promise<SeededProcedure> {
  const procedureId = randomUUID();
  await prisma.procedure.create({
    data: {
      id: procedureId,
      ownerId: FIXTURE_USERS.admin.id,
      areas: { create: opts.areaIds.map((areaId) => ({ areaId })) },
    },
  });
  const versions: SeededProcedure['versions'] = {};
  for (const v of opts.versions) {
    const id = randomUUID();
    const stepIds = v.steps.map(() => randomUUID());
    await prisma.procedureVersion.create({
      data: {
        id,
        procedureId,
        versionNumber: v.versionNumber,
        status: v.status,
        title: v.title ?? 'Cierre de caja',
        createdById: FIXTURE_USERS.admin.id,
        steps: {
          create: v.steps.map((s, i) => ({
            id: stepIds[i],
            stepOrder: i + 1,
            title: s.title,
            description: s.description ?? '',
          })),
        },
      },
    });
    versions[v.versionNumber] = { id, stepIds };
  }
  return { procedureId, versions };
}

export async function seedExecution(
  prisma: PrismaService,
  opts: { userId: string; procedureId: string; procedureVersionId: string },
): Promise<void> {
  await prisma.execution.create({
    data: { ...opts, status: 'IN_PROGRESS', startedAt: new Date() },
  });
}

export async function deleteProcedures(
  prisma: PrismaService,
  procedureIds: string[],
): Promise<void> {
  await prisma.execution.deleteMany({
    where: { procedureId: { in: procedureIds } },
  });
  // Las versiones, los pasos y las áreas se borran en cascada.
  await prisma.procedure.deleteMany({ where: { id: { in: procedureIds } } });
}
