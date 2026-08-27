import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AuthenticatedUser,
  CreateRoomCommentRequest,
  RoomCommentHistoryItem,
  RoomReactionEmoji,
  SetRoomCommentPinnedRequest,
  SetRoomCommentReactionRequest,
} from '@live-discussions/contracts';
import { RoomMembershipService } from './room-membership.service';

interface MemoryComment {
  id: string;
  roomId: string;
  participantIdentity: string;
  participantName: string;
  text: string;
  timestamp: number;
  replyToId: string | null;
  reactions: Map<RoomReactionEmoji, Set<string>>;
  pinned: boolean;
}

const MAX_HISTORY_ITEMS = 200;

@Injectable()
export class RoomCommentsService {
  private readonly commentsByRoom = new Map<string, Map<string, MemoryComment>>();

  constructor(private readonly memberships: RoomMembershipService) {}

  async listComments(roomIdentifier: string, user: AuthenticatedUser): Promise<RoomCommentHistoryItem[]> {
    const roomId = await this.requireMembership(roomIdentifier, user.userId);
    const comments = [...(this.commentsByRoom.get(roomId)?.values() ?? [])]
      .sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id))
      .slice(-MAX_HISTORY_ITEMS);
    return comments.map((comment) => this.toHistoryItem(comment));
  }

  async createComment(
    roomIdentifier: string,
    request: CreateRoomCommentRequest,
    user: AuthenticatedUser,
  ): Promise<RoomCommentHistoryItem> {
    const roomId = await this.requireMembership(roomIdentifier, user.userId);
    const roomComments = this.getOrCreateRoom(roomId);
    const existing = roomComments.get(request.id);
    if (existing) return this.resolveIdempotentCreate(existing, request, user);

    if (request.replyToId && !roomComments.has(request.replyToId)) {
      throw new NotFoundException('The comment being replied to was not found in this room.');
    }

    const comment: MemoryComment = {
      id: request.id,
      roomId,
      participantIdentity: user.userId,
      participantName: user.displayName,
      text: request.text,
      timestamp: Date.now(),
      replyToId: request.replyToId,
      reactions: new Map(),
      pinned: false,
    };
    roomComments.set(comment.id, comment);
    this.trimHistory(roomComments);
    return this.toHistoryItem(comment);
  }

  async setReaction(
    roomIdentifier: string,
    commentId: string,
    request: SetRoomCommentReactionRequest,
    user: AuthenticatedUser,
  ): Promise<void> {
    const roomId = await this.requireMembership(roomIdentifier, user.userId);
    const comment = this.commentsByRoom.get(roomId)?.get(commentId);
    if (!comment) throw new NotFoundException('Comment not found.');

    const identities = comment.reactions.get(request.emoji) ?? new Set<string>();
    if (request.active) identities.add(user.userId);
    else identities.delete(user.userId);

    if (identities.size > 0) comment.reactions.set(request.emoji, identities);
    else comment.reactions.delete(request.emoji);
  }

  async setPinned(
    roomIdentifier: string,
    commentId: string,
    request: SetRoomCommentPinnedRequest,
    user: AuthenticatedUser,
  ): Promise<void> {
    const roomId = await this.requireModerator(roomIdentifier, user.userId);
    const comment = this.commentsByRoom.get(roomId)?.get(commentId);
    if (!comment) throw new NotFoundException('Comment not found.');
    comment.pinned = request.pinned;
  }

  clearRoom(roomId: string): void {
    this.commentsByRoom.delete(roomId);
  }

  private async requireMembership(roomIdentifier: string, userId: string): Promise<string> {
    const roomId = await this.memberships.resolveRoomId(roomIdentifier);
    const membership = await this.memberships.getMembership(roomId, userId);
    if (!membership) throw new ForbiddenException('You must join this room before accessing comments.');
    return roomId;
  }

  private async requireModerator(roomIdentifier: string, userId: string): Promise<string> {
    const roomId = await this.requireMembership(roomIdentifier, userId);
    const role = await this.memberships.getRole(roomId, userId);
    if (role !== 'owner' && role !== 'moderator') {
      throw new ForbiddenException('Only owners and moderators can pin room comments.');
    }
    return roomId;
  }

  private resolveIdempotentCreate(
    existing: MemoryComment,
    request: CreateRoomCommentRequest,
    user: AuthenticatedUser,
  ): RoomCommentHistoryItem {
    if (
      existing.participantIdentity === user.userId
      && existing.text === request.text
      && existing.replyToId === request.replyToId
    ) {
      return this.toHistoryItem(existing);
    }
    throw new ConflictException('Comment id is already in use.');
  }

  private getOrCreateRoom(roomId: string): Map<string, MemoryComment> {
    const existing = this.commentsByRoom.get(roomId);
    if (existing) return existing;
    const comments = new Map<string, MemoryComment>();
    this.commentsByRoom.set(roomId, comments);
    return comments;
  }

  private trimHistory(comments: Map<string, MemoryComment>): void {
    if (comments.size <= MAX_HISTORY_ITEMS) return;
    const oldest = [...comments.values()]
      .sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id))
      .slice(0, comments.size - MAX_HISTORY_ITEMS);
    for (const comment of oldest) comments.delete(comment.id);
  }

  private toHistoryItem(comment: MemoryComment): RoomCommentHistoryItem {
    const reactions: Partial<Record<RoomReactionEmoji, string[]>> = {};
    for (const [emoji, identities] of comment.reactions) {
      if (identities.size > 0) reactions[emoji] = [...identities];
    }

    return {
      id: comment.id,
      participantIdentity: comment.participantIdentity,
      participantName: comment.participantName,
      text: comment.text,
      timestamp: comment.timestamp,
      replyToId: comment.replyToId,
      reactions,
      pinned: comment.pinned,
    };
  }
}
