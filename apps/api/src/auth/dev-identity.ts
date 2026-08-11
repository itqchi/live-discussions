import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedUser } from '@live-discussions/contracts';

const MAX_USER_ID_LENGTH = 120;
const MAX_DISPLAY_NAME_LENGTH = 80;

type Headers = Record<string, string | string[] | undefined>;

export function devIdentityFromHeaders(headers: Headers): AuthenticatedUser {
  const identity = optionalDevIdentityFromHeaders(headers);
  if (!identity) {
    throw new BadRequestException('Development identity headers are required.');
  }
  return identity;
}

export function optionalDevIdentityFromHeaders(headers: Headers): AuthenticatedUser | null {
  const userId = firstHeaderValue(headers['x-dev-user-id'])?.trim();
  const displayName = firstHeaderValue(headers['x-dev-display-name'])?.trim();

  if (!userId && !displayName) return null;
  if (!userId || !displayName) {
    throw new BadRequestException('Development identity headers must be supplied together.');
  }
  if (userId.length > MAX_USER_ID_LENGTH) {
    throw new BadRequestException('Development user id is too long.');
  }
  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new BadRequestException('Display name is too long.');
  }

  return { userId, displayName };
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
