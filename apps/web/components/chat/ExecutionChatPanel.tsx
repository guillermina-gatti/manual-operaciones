'use client';

// El panel del asistente desde la ejecución (spec 010, F1 y F4): toma la versión y el paso actual.
// Completada (sin paso actual), no muestra nada. key={currentStepId}: al cambiar el paso se monta un
// panel nuevo, que corta la respuesta en curso y empieza otra conversación (PD7).
import type { ExecutionResponse } from '@/lib/api';
import { ChatPanel } from './ChatPanel';

export function ExecutionChatPanel({ execution }: { execution: ExecutionResponse }) {
  const step = execution.steps.find((s) => s.stepId === execution.currentStepId);
  if (!step) return null;

  return (
    <ChatPanel
      key={step.stepId}
      procedureVersionId={execution.procedureVersionId}
      step={{ stepId: step.stepId, order: step.order, title: step.title }}
    />
  );
}
