import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedUser } from '@live-discussions/contracts';

const MAX_USER_ID_LENGTH = 120;
const MAX_DISPLAY_NAME_LENGTH = 80;

export function devIdentityFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): AuthenticatedUser {
  const userId = firstHeaderValue(headers['x-dev-user-id'])?.trim();
  const displayName = firstHeaderValue(headers['x-dev-display-name'])?.trim();

  if (!userId || !displayName) {
    throw new BadRequestException('Development identity headers are required.');
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
