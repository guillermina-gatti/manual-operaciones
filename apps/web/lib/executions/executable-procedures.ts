// The procedures an employee can execute on /ejecuciones (HU12 with HU11): the ones GET
// /api/procedures gives, which are already only those of the user's areas, kept when their
// current version is published and has steps.
import { ApiError } from '@/lib/api';
import { MESSAGES } from '@/lib/api/error-messages';
import type { ProcedureAreaView, ProcedureListItem } from '@/lib/procedures';

export interface ExecutableProcedure {
  id: string;
  title: string; // of the current version
  areas: ProcedureAreaView[];
}

// The listing shows the current version, or the draft when there is none (only an ADMIN gets
// those): a draft, or a version without steps, cannot be executed.
export function executableProcedures(items: readonly ProcedureListItem[]): ExecutableProcedure[] {
  return items
    .filter((item) => item.version.status === 'PUBLISHED' && item.version.stepCount > 0)
    .map((item) => ({ id: item.id, title: item.version.title, areas: item.areas }));
}

export interface ListErrorDescription {
  message: string;
  canRetry: boolean;
}

// Loading the list failed. Never the text of the API.
export function describeListError(error: unknown): ListErrorDescription {
  if (!(error instanceof ApiError)) return { message: MESSAGES.unexpected, canRetry: true };
  switch (error.status) {
    case 0:
      return { message: MESSAGES.noConnection, canRetry: true };
    case 401:
      return { message: MESSAGES.sessionInvalid, canRetry: false };
    case 503:
      return { message: MESSAGES.unavailable, canRetry: true };
    default:
      return { message: MESSAGES.unexpected, canRetry: true };
  }
}
