import type { ApiClient } from './client';

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

export interface CreateInvitationPayload {
  email: string;
  role: 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE';
  areaIds?: string[];
}

export interface CreatedInvitation {
  id: string;
  email: string;
  role: 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE';
  areaIds: string[];
  expiresAt: string;
  createdAt: string;
  invitationUrl?: string;
}

export interface InvitationListItem {
  id: string;
  email: string;
  role: 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE';
  status: InvitationStatus;
  areaIds: string[];
  areaNames: string[];
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdBy: {
    id: string;
    name: string;
  };
}

export const INVITATIONS_CHANGED_EVENT = 'invitations:changed';

export function notifyInvitationsChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(INVITATIONS_CHANGED_EVENT));
  }
}

export function createInvitationsApi(client: ApiClient) {
  return {
    createInvitation(payload: CreateInvitationPayload): Promise<CreatedInvitation> {
      return client.request<CreatedInvitation>('/api/users/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    },

    listInvitations(signal?: AbortSignal): Promise<InvitationListItem[]> {
      return client.request<InvitationListItem[]>('/api/users/invitations', {
        signal,
      });
    },

    revokeInvitation(id: string): Promise<{ id: string; revoked: boolean }> {
      return client.request<{ id: string; revoked: boolean }>(`/api/users/invitations/${id}`, {
        method: 'DELETE',
      });
    },
  };
}
