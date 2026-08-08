export type ParticipantRole = 'owner' | 'moderator' | 'speaker' | 'listener';

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
  raisedHand?: boolean;
  onStage?: boolean;
}

export interface DiscussionRoom {
  id: string;
  slug: string;
  title: string;
  isLive: boolean;
  participants: RoomParticipant[];
}

export interface RoomSummary {
  id: string;
  slug: string;
  title: string;
  isLive: boolean;
  memberCount: number;
}

export interface CreateRoomRequest {
  /** Route slug derived from the room name. The server generates the room's immutable unique id. */
  roomId: string;
  title: string;
}

export interface CreateRoomResponse {
  room: DiscussionRoom;
  participant: RoomParticipant;
}

export interface JoinRoomRequest {
  /** Public route slug, not the internal room id. */
  roomId: string;
}

export interface JoinRoomResponse {
  livekitUrl: string;
  token: string;
  participant: RoomParticipant;
  roomId: string;
  roomSlug: string;
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
  role: ParticipantRole;
}

export interface SetFeaturedParticipantRequest {
  roomId: string;
  participantId: string | null;
}

export interface RemoveParticipantRequest {
  roomId: string;
  participantId: string;
}
