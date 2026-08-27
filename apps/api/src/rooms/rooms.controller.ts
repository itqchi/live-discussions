import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type {
  AuthenticatedUser,
  CreateRoomResponse,
  JoinRoomResponse,
  RoomBannedUser,
  RoomCommentHistoryItem,
  RoomParticipant,
  RoomSummary,
} from '@live-discussions/contracts';
import { DevUser } from '../auth/dev-user.decorator';
import { CreateRoomCommentDto } from './dto/create-room-comment.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { JoinRoomDto } from './dto/join-room.dto';
import { MuteParticipantDto } from './dto/mute-participant.dto';
import { RaiseHandDto } from './dto/raise-hand.dto';
import { SetFeaturedParticipantDto } from './dto/set-featured-participant.dto';
import { SetRoomCommentPinnedDto } from './dto/set-room-comment-pinned.dto';
import { SetRoomCommentReactionDto } from './dto/set-room-comment-reaction.dto';
import { SetStagePresenceDto } from './dto/set-stage-presence.dto';
import { UpdateParticipantRoleDto } from './dto/update-participant-role.dto';
import { UpdateRoomSettingsDto } from './dto/update-room-settings.dto';
import { RoomCommentsService } from './room-comments.service';
import { RoomLifecycleService } from './room-lifecycle.service';
import { RoomModerationService } from './room-moderation.service';
import { RoomSettingsService } from './room-settings.service';
import { RoomsService } from './rooms.service';

@Controller('rooms')
export class RoomsController {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly roomComments: RoomCommentsService,
    private readonly roomSettings: RoomSettingsService,
    private readonly roomModeration: RoomModerationService,
    private readonly roomLifecycle: RoomLifecycleService,
  ) {}

  @Get()
  list(): Promise<RoomSummary[]> {
    return this.roomsService.listRooms();
  }

  @Post()
  create(
    @Body() request: CreateRoomDto,
    @DevUser() user: AuthenticatedUser,
  ): Promise<CreateRoomResponse> {
    return this.roomsService.createRoom(request, user);
  }

  @Post('join')
  join(
    @Body() request: JoinRoomDto,
    @DevUser() user: AuthenticatedUser,
  ): Promise<JoinRoomResponse> {
    return this.roomsService.createJoinToken(request, user);
  }

  @Post(':roomId/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  async leave(@Param('roomId') roomId: string): Promise<void> {
    await this.roomLifecycle.handleExplicitLeave(roomId);
  }

  @Get(':roomId')
  getRoom(@Param('roomId') roomId: string): Promise<RoomSummary> {
    return this.roomSettings.getRoom(roomId);
  }

  @Patch(':roomId/settings')
  updateRoom(
    @Param('roomId') roomId: string,
    @Body() request: UpdateRoomSettingsDto,
    @DevUser() user: AuthenticatedUser,
  ): Promise<RoomSummary> {
    return this.roomSettings.updateRoom(roomId, request, user);
  }

  @Get(':roomId/bans')
  listBannedUsers(
    @Param('roomId') roomId: string,
    @DevUser() user: AuthenticatedUser,
  ): Promise<RoomBannedUser[]> {
    return this.roomSettings.listBannedUsers(roomId, user);
  }

  @Patch(':roomId/bans/:participantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async banParticipant(
    @Param('roomId') roomId: string,
    @Param('participantId') participantId: string,
    @DevUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.roomSettings.banParticipant(roomId, participantId, user);
  }

  @Delete(':roomId/bans/:participantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unbanParticipant(
    @Param('roomId') roomId: string,
    @Param('participantId') participantId: string,
    @DevUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.roomSettings.unbanParticipant(roomId, participantId, user);
  }

  @Get(':roomId/comments')
  listComments(
    @Param('roomId') roomId: string,
    @DevUser() user: AuthenticatedUser,
  ): Promise<RoomCommentHistoryItem[]> {
    return this.roomComments.listComments(roomId, user);
  }

  @Post(':roomId/comments')
  createComment(
    @Param('roomId') roomId: string,
    @Body() request: CreateRoomCommentDto,
    @DevUser() user: AuthenticatedUser,
  ): Promise<RoomCommentHistoryItem> {
    return this.roomComments.createComment(roomId, request, user);
  }

  @Patch(':roomId/comments/:commentId/reaction')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setCommentReaction(
    @Param('roomId') roomId: string,
    @Param('commentId') commentId: string,
    @Body() request: SetRoomCommentReactionDto,
    @DevUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.roomComments.setReaction(roomId, commentId, request, user);
  }

  @Patch(':roomId/comments/:commentId/pinned')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setCommentPinned(
    @Param('roomId') roomId: string,
    @Param('commentId') commentId: string,
    @Body() request: SetRoomCommentPinnedDto,
    @DevUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.roomComments.setPinned(roomId, commentId, request, user);
  }

  @Patch('hand')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setRaisedHand(
    @Body() request: RaiseHandDto,
    @DevUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.roomsService.setRaisedHand(request, user);
  }

  @Patch('stage-presence')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setStagePresence(
    @Body() request: SetStagePresenceDto,
    @DevUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.roomsService.setStagePresence(request, user);
  }

  @Patch('featured-participant')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setFeaturedParticipant(
    @Body() request: SetFeaturedParticipantDto,
    @DevUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.roomsService.setFeaturedParticipant(request, user);
  }

  @Patch('participants/role')
  updateParticipantRole(
    @Body() request: UpdateParticipantRoleDto,
    @DevUser() user: AuthenticatedUser,
  ): Promise<RoomParticipant> {
    return this.roomsService.updateParticipantRole(request, user);
  }

  @Patch(':roomId/participants/:participantId/mute')
  @HttpCode(HttpStatus.NO_CONTENT)
  async muteParticipant(
    @Param('roomId') roomId: string,
    @Param('participantId') participantId: string,
    @Body() request: MuteParticipantDto,
    @DevUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.roomModeration.muteParticipantMicrophone(
      {
        roomId,
        participantId,
        durationSeconds: request.durationSeconds ?? null,
      },
      user,
    );
  }

  @Delete(':roomId/participants/:participantId/mute')
  @HttpCode(HttpStatus.NO_CONTENT)
  async releaseTimedMute(
    @Param('roomId') roomId: string,
    @Param('participantId') participantId: string,
    @DevUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.roomModeration.releaseTimedMute(roomId, participantId, user);
  }

  @Delete(':roomId/participants/:participantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeParticipant(
    @Param('roomId') roomId: string,
    @Param('participantId') participantId: string,
    @DevUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.roomsService.removeParticipant({ roomId, participantId }, user);
  }

  @Delete(':roomId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async closeRoom(
    @Param('roomId') roomId: string,
    @DevUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.roomsService.closeRoom({ roomId }, user);
  }
}
