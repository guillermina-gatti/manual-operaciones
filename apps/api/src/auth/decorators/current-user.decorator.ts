import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthRequest, AuthUser } from '../auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser | undefined =>
    context.switchToHttp().getRequest<AuthRequest>().user,
);
