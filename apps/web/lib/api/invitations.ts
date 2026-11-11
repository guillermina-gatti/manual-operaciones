import type { ApiClient } from './client';

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

export function createInvitationsApi(client: ApiClient) {
  return {
    createInvitation(payload: CreateInvitationPayload): Promise<CreatedInvitation> {
      return client.request<CreatedInvitation>('/api/users/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    },
  };
}
