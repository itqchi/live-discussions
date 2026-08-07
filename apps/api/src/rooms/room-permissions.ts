import type { ParticipantPermissions, ParticipantRole } from '../../../../libs/contracts/src/lib/room';

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
