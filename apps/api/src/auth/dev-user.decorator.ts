import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '@live-discussions/contracts';
import { devIdentityFromHeaders, optionalDevIdentityFromHeaders } from './dev-identity';

type RequestWithHeaders = {
  headers: Record<string, string | string[] | undefined>;
};

interface DevUserOptions {
  optional?: boolean;
}

export const DevUser = createParamDecorator(
  (options: DevUserOptions | undefined, context: ExecutionContext): AuthenticatedUser | null => {
    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    return options?.optional
      ? optionalDevIdentityFromHeaders(request.headers)
      : devIdentityFromHeaders(request.headers);
  },
);
