export const ROLES = ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'] as const;
export type Role = (typeof ROLES)[number];

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  areaIds: string[];
}

export interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
}

export const isRole = (value: unknown): value is Role =>
  ROLES.includes(value as Role);
