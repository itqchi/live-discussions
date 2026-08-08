import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '@live-discussions/contracts';
import { devIdentityFromHeaders } from './dev-identity';

type RequestWithHeaders = {
  headers: Record<string, string | string[] | undefined>;
};

export const DevUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    return devIdentityFromHeaders(request.headers);
  },
);
