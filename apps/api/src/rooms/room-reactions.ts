import type { RoomReactionEmoji } from '@live-discussions/contracts';

export const ROOM_REACTION_EMOJIS: readonly RoomReactionEmoji[] = ['👍', '❤️', '😂', '👏', '🔥'];

export function isRoomReactionEmoji(value: string): value is RoomReactionEmoji {
  return (ROOM_REACTION_EMOJIS as readonly string[]).includes(value);
}
