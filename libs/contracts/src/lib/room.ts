export type ParticipantRole = 'owner' | 'moderator' | 'speaker' | 'listener';
export type ModeratedParticipantRole = Extract<ParticipantRole, 'speaker' | 'listener'>;

export const ROOM_REACTION_EMOJIS = ['👍', '❤️', '😂', '👏', '🔥'] as const;
export type RoomReactionEmoji = (typeof ROOM_REACTION_EMOJIS)[number];

export function isRoomReactionEmoji(value: string): value is RoomReactionEmoji {
  return (ROOM_REACTION_EMOJIS as readonly string[]).includes(value);
}

export interface ParticipantPermissions {
  canPublishAudio: boolean;
  canPublishVideo: boolean;
  canShareScreen: boolean;
  canInviteSpeakers: boolean;
}

export interface AuthenticatedUser {
  userId: string;
  displayName: string;
}

export interface RoomParticipant {
  userId: string;
  displayName: string;
  role: ParticipantRole;
  permissions: ParticipantPermissions;
  raisedHand: boolean;
  onStage: boolean;
}

export interface RoomBannedUser {
  userId: string;
  displayName: string;
}

export interface DiscussionRoom {
  id: string;
  slug: string;
  title: string;
  description?: string;
  isLive: boolean;
  isLocked?: boolean;
  participants: RoomParticipant[];
}

export interface RoomSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  isLive: boolean;
  isLocked: boolean;
  memberCount: number;
}

export interface CreateRoomRequest {
  /** Human-readable title. The server owns both slug generation and the immutable room id. */
  title: string;
}

export interface CreateRoomResponse {
  /** Creation is actor-neutral; joining the room has its own session/participant response. */
  room: DiscussionRoom;
}

export interface JoinRoomRequest {
  /** Public route slug, not the immutable room id. */
  roomId: string;
}

export interface JoinRoomResponse {
  livekitUrl: string;
  token: string;
  participant: RoomParticipant;
  roomId: string;
  roomSlug: string;
  roomTitle: string;
}

export interface UpdateRoomSettingsRequest {
  title: string;
  description: string;
  isLocked: boolean;
}

export interface RoomCommentHistoryItem {
  id: string;
  participantIdentity: string;
  participantName: string;
  text: string;
  timestamp: number;
  replyToId: string | null;
  reactions: Partial<Record<RoomReactionEmoji, string[]>>;
  pinned: boolean;
}

export interface CreateRoomCommentRequest {
  id: string;
  text: string;
  replyToId: string | null;
}

export interface SetRoomCommentReactionRequest {
  emoji: RoomReactionEmoji;
  active: boolean;
}

export interface SetRoomCommentPinnedRequest {
  pinned: boolean;
}

export interface CloseRoomRequest {
  /** Public route slug for room-page requests; House APIs may resolve their stored room id directly. */
  roomId: string;
}

export interface RaiseHandRequest {
  roomId: string;
  raised: boolean;
}

export interface SetStagePresenceRequest {
  roomId: string;
  onStage: boolean;
}

export interface UpdateParticipantRoleRequest {
  roomId: string;
  participantId: string;
  role: ModeratedParticipantRole;
}

export interface SetFeaturedParticipantRequest {
  roomId: string;
  participantId: string | null;
}

export interface RemoveParticipantRequest {
  roomId: string;
  participantId: string;
}

export interface BanParticipantRequest extends RemoveParticipantRequest {}
