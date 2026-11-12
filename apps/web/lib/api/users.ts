import type { ApiClient } from './client';
import type { Role } from '@/lib/session';

export interface AdminUserArea {
  id: string;
  name: string;
}

export interface AdminUserItem {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  areas: AdminUserArea[];
  createdAt: string;
}

export interface UpdateUserPayload {
  role?: Role;
  areaIds?: string[];
  isActive?: boolean;
}

export const USERS_CHANGED_EVENT = 'users:changed';

export function notifyUsersChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(USERS_CHANGED_EVENT));
  }
}

export function createUsersApi(client: ApiClient) {
  return {
    listAdminUsers(signal?: AbortSignal): Promise<AdminUserItem[]> {
      return client.request<AdminUserItem[]>('/api/users/manage', {
        signal,
      });
    },

    updateUser(id: string, payload: UpdateUserPayload): Promise<AdminUserItem> {
      return client.request<AdminUserItem>(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    },
  };
}
