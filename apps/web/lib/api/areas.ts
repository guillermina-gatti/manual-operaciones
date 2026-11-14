import type { ApiClient } from './client';

export interface AreaItem {
  id: string;
  name: string;
  isActive: boolean;
}

export interface CreateAreaPayload {
  name: string;
}

export interface UpdateAreaPayload {
  name?: string;
  isActive?: boolean;
}

export const AREAS_CHANGED_EVENT = 'areas:changed';

export function notifyAreasChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AREAS_CHANGED_EVENT));
  }
}

export function createAreasApi(client: ApiClient) {
  return {
    listAreas(signal?: AbortSignal): Promise<AreaItem[]> {
      return client.request<AreaItem[]>('/api/areas', { signal });
    },

    createArea(payload: CreateAreaPayload): Promise<AreaItem> {
      return client.request<AreaItem>('/api/areas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    },

    updateArea(id: string, payload: UpdateAreaPayload): Promise<AreaItem> {
      return client.request<AreaItem>(`/api/areas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    },
  };
}
