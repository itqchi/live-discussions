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
}

export interface DiscussionRoom {
  id: string;
  title: string;
  isLive: boolean;
  participants: RoomParticipant[];
}

export interface RoomSummary {
  id: string;
  title: string;
  isLive: boolean;
  memberCount: number;
}

export interface CreateRoomRequest {
  roomId: string;
  title: string;
}

export interface CreateRoomResponse {
  room: DiscussionRoom;
  participant: RoomParticipant;
}

export interface JoinRoomRequest {
  roomId: string;
}

export interface JoinRoomResponse {
  livekitUrl: string;
  token: string;
  participant: RoomParticipant;
}

export interface RaiseHandRequest {
  roomId: string;
  raised: boolean;
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
