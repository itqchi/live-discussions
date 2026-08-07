import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedUser } from '@live-discussions/contracts';

export function devIdentityFromHeaders(headers: Record<string, string | string[] | undefined>): AuthenticatedUser {
  const rawUserId = headers['x-dev-user-id'];
  const rawDisplayName = headers['x-dev-display-name'];
  const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
  const displayName = Array.isArray(rawDisplayName) ? rawDisplayName[0] : rawDisplayName;

  if (!userId?.trim() || !displayName?.trim()) {
    throw new BadRequestException('Development identity headers are required');
  }

  return {
    userId: userId.trim(),
    displayName: displayName.trim(),
  };
}
