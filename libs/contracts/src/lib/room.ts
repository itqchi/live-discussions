export type ParticipantRole = 'owner' | 'moderator' | 'speaker' | 'listener';

export interface ParticipantPermissions {
  canPublishAudio: boolean;
  canPublishVideo: boolean;
  canShareScreen: boolean;
  canInviteSpeakers: boolean;
}

export interface RoomParticipant {
  userId: string;
  displayName: string;
  role: ParticipantRole;
  permissions: ParticipantPermissions;
}

export interface DiscussionRoom {
  id: string;
  title: string;
  isLive: boolean;
  participants: RoomParticipant[];
}

export interface JoinRoomRequest {
  roomId: string;
  userId: string;
  displayName: string;
  role: ParticipantRole;
}

export interface JoinRoomResponse {
  livekitUrl: string;
  token: string;
  participant: RoomParticipant;
}
