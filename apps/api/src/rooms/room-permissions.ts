import type { ParticipantPermissions, ParticipantRole } from '@live-discussions/contracts';
import { TrackSource } from 'livekit-server-sdk';

export interface LiveKitPublishingPermission {
  canSubscribe: boolean;
  canPublish: boolean;
  canPublishData: boolean;
  canPublishSources: TrackSource[];
}

export function permissionsForRole(role: ParticipantRole): ParticipantPermissions {
  switch (role) {
    case 'owner':
    case 'moderator':
      return {
        canPublishAudio: true,
        canPublishVideo: true,
        canShareScreen: true,
        canInviteSpeakers: true,
      };
    case 'speaker':
      return {
        canPublishAudio: true,
        canPublishVideo: true,
        canShareScreen: true,
        canInviteSpeakers: false,
      };
    case 'listener':
      return {
        canPublishAudio: false,
        canPublishVideo: false,
        canShareScreen: false,
        canInviteSpeakers: false,
      };
  }
}

export function liveKitPublishingPermission(
  role: ParticipantRole,
  onStage: boolean,
  microphoneAllowed = true,
): LiveKitPublishingPermission {
  const permissions = permissionsForRole(role);
  const sources: TrackSource[] = [];

  if (onStage && permissions.canPublishVideo) sources.push(TrackSource.CAMERA);
  if (onStage && permissions.canPublishAudio && microphoneAllowed) {
    sources.push(TrackSource.MICROPHONE);
  }
  if (onStage && permissions.canShareScreen) {
    sources.push(TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO);
  }

  return {
    canSubscribe: true,
    canPublish: sources.length > 0,
    canPublishData: true,
    canPublishSources: sources,
  };
}
