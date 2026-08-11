import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AuthenticatedUser,
  CreateRoomCommentRequest,
  RoomCommentHistoryItem,
  RoomReactionEmoji,
  SetRoomCommentPinnedRequest,
  SetRoomCommentReactionRequest,
} from '@live-discussions/contracts';
import { DatabaseService } from '../database/database.service';
import { RoomMembershipService } from './room-membership.service';
import { isRoomReactionEmoji } from './room-reactions';

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

interface CommentRow {
  id: string;
  user_id: string;
  participant_name: string;
  text: string;
  reply_to_id: string | null;
  created_at: Date | string;
  pinned: boolean;
}

interface ReactionRow {
  comment_id: string;
  user_id: string;
  emoji: string;
}

const MAX_HISTORY_ITEMS = 200;

@Injectable()
export class RoomCommentsService {
  private readonly commentsByRoom = new Map<string, Map<string, MemoryComment>>();

  constructor(
    private readonly database: DatabaseService,
    private readonly memberships: RoomMembershipService,
  ) {}

  async listComments(roomIdentifier: string, user: AuthenticatedUser): Promise<RoomCommentHistoryItem[]> {
    const roomId = await this.requireMembership(roomIdentifier, user.userId);

    if (!this.database.configured) {
      const comments = [...(this.commentsByRoom.get(roomId)?.values() ?? [])]
        .sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id))
        .slice(-MAX_HISTORY_ITEMS);
      return comments.map((comment) => this.toMemoryHistoryItem(comment));
    }

    const result = await this.database.query<CommentRow>(
      `SELECT id, user_id, participant_name, text, reply_to_id, created_at, pinned
       FROM (
         SELECT id, user_id, participant_name, text, reply_to_id, created_at, pinned
         FROM room_comment
         WHERE room_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT $2
       ) recent
       ORDER BY created_at ASC, id ASC`,
      [roomId, MAX_HISTORY_ITEMS],
    );

    if (result.rows.length === 0) return [];

    const reactionResult = await this.database.query<ReactionRow>(
      `SELECT comment_id, user_id, emoji
       FROM room_comment_reaction
       WHERE comment_id = ANY($1::text[])
       ORDER BY created_at ASC`,
      [result.rows.map((comment) => comment.id)],
    );

    const reactionsByComment = new Map<string, Partial<Record<RoomReactionEmoji, string[]>>>();
    for (const reaction of reactionResult.rows) {
      if (!isRoomReactionEmoji(reaction.emoji)) continue;
      const reactions = reactionsByComment.get(reaction.comment_id) ?? {};
      const identities = reactions[reaction.emoji] ?? [];
      if (!identities.includes(reaction.user_id)) identities.push(reaction.user_id);
      reactions[reaction.emoji] = identities;
      reactionsByComment.set(reaction.comment_id, reactions);
    }

    return result.rows.map((comment) => ({
      id: comment.id,
      participantIdentity: comment.user_id,
      participantName: comment.participant_name,
      text: comment.text,
      timestamp: this.toTimestamp(comment.created_at),
      replyToId: comment.reply_to_id,
      reactions: reactionsByComment.get(comment.id) ?? {},
      pinned: comment.pinned,
    }));
  }

  async createComment(
    roomIdentifier: string,
    request: CreateRoomCommentRequest,
    user: AuthenticatedUser,
  ): Promise<RoomCommentHistoryItem> {
    const roomId = await this.requireMembership(roomIdentifier, user.userId);

    if (!this.database.configured) {
      const roomComments = this.getOrCreateMemoryRoom(roomId);
      const existing = roomComments.get(request.id);
      if (existing) return this.resolveIdempotentMemoryCreate(existing, request, user);

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
      this.trimMemoryHistory(roomComments);
      return this.toMemoryHistoryItem(comment);
    }

    return this.database.transaction(async (client) => {
      if (request.replyToId) {
        const reply = await client.query<{ id: string }>(
          'SELECT id FROM room_comment WHERE id = $1 AND room_id = $2',
          [request.replyToId, roomId],
        );
        if (!reply.rows[0]) {
          throw new NotFoundException('The comment being replied to was not found in this room.');
        }
      }

      const inserted = await client.query<CommentRow>(
        `INSERT INTO room_comment (
           id, room_id, user_id, participant_name, text, reply_to_id
         ) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING
         RETURNING id, user_id, participant_name, text, reply_to_id, created_at, pinned`,
        [request.id, roomId, user.userId, user.displayName, request.text, request.replyToId],
      );

      const row = inserted.rows[0];
      if (row) return this.toDatabaseHistoryItem(row);

      const existing = await client.query<CommentRow & { room_id: string }>(
        `SELECT id, room_id, user_id, participant_name, text, reply_to_id, created_at, pinned
         FROM room_comment
         WHERE id = $1`,
        [request.id],
      );
      const existingRow = existing.rows[0];
      if (
        existingRow
        && existingRow.room_id === roomId
        && existingRow.user_id === user.userId
        && existingRow.text === request.text
        && existingRow.reply_to_id === request.replyToId
      ) {
        return this.toDatabaseHistoryItem(existingRow);
      }

      throw new ConflictException('Comment id is already in use.');
    });
  }

  async setReaction(
    roomIdentifier: string,
    commentId: string,
    request: SetRoomCommentReactionRequest,
    user: AuthenticatedUser,
  ): Promise<void> {
    const roomId = await this.requireMembership(roomIdentifier, user.userId);

    if (!this.database.configured) {
      const comment = this.commentsByRoom.get(roomId)?.get(commentId);
      if (!comment) throw new NotFoundException('Comment not found.');

      const identities = comment.reactions.get(request.emoji) ?? new Set<string>();
      if (request.active) identities.add(user.userId);
      else identities.delete(user.userId);

      if (identities.size > 0) comment.reactions.set(request.emoji, identities);
      else comment.reactions.delete(request.emoji);
      return;
    }

    const comment = await this.database.query<{ id: string }>(
      'SELECT id FROM room_comment WHERE id = $1 AND room_id = $2',
      [commentId, roomId],
    );
    if (!comment.rows[0]) throw new NotFoundException('Comment not found.');

    if (request.active) {
      await this.database.query(
        `INSERT INTO room_comment_reaction (comment_id, user_id, emoji)
         VALUES ($1, $2, $3)
         ON CONFLICT (comment_id, user_id, emoji) DO NOTHING`,
        [commentId, user.userId, request.emoji],
      );
      return;
    }

    await this.database.query(
      'DELETE FROM room_comment_reaction WHERE comment_id = $1 AND user_id = $2 AND emoji = $3',
      [commentId, user.userId, request.emoji],
    );
  }

  async setPinned(
    roomIdentifier: string,
    commentId: string,
    request: SetRoomCommentPinnedRequest,
    user: AuthenticatedUser,
  ): Promise<void> {
    const roomId = await this.requireModerator(roomIdentifier, user.userId);

    if (!this.database.configured) {
      const comment = this.commentsByRoom.get(roomId)?.get(commentId);
      if (!comment) throw new NotFoundException('Comment not found.');
      comment.pinned = request.pinned;
      return;
    }

    const result = await this.database.query(
      'UPDATE room_comment SET pinned = $3 WHERE id = $1 AND room_id = $2',
      [commentId, roomId, request.pinned],
    );
    if (result.rowCount === 0) throw new NotFoundException('Comment not found.');
  }

  clearRoom(roomId: string): void {
    if (!this.database.configured) this.commentsByRoom.delete(roomId);
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

  private resolveIdempotentMemoryCreate(
    existing: MemoryComment,
    request: CreateRoomCommentRequest,
    user: AuthenticatedUser,
  ): RoomCommentHistoryItem {
    if (
      existing.participantIdentity === user.userId
      && existing.text === request.text
      && existing.replyToId === request.replyToId
    ) {
      return this.toMemoryHistoryItem(existing);
    }
    throw new ConflictException('Comment id is already in use.');
  }

  private getOrCreateMemoryRoom(roomId: string): Map<string, MemoryComment> {
    const existing = this.commentsByRoom.get(roomId);
    if (existing) return existing;
    const comments = new Map<string, MemoryComment>();
    this.commentsByRoom.set(roomId, comments);
    return comments;
  }

  private trimMemoryHistory(comments: Map<string, MemoryComment>): void {
    if (comments.size <= MAX_HISTORY_ITEMS) return;
    const oldest = [...comments.values()]
      .sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id))
      .slice(0, comments.size - MAX_HISTORY_ITEMS);
    for (const comment of oldest) comments.delete(comment.id);
  }

  private toMemoryHistoryItem(comment: MemoryComment): RoomCommentHistoryItem {
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

  private toDatabaseHistoryItem(comment: CommentRow): RoomCommentHistoryItem {
    return {
      id: comment.id,
      participantIdentity: comment.user_id,
      participantName: comment.participant_name,
      text: comment.text,
      timestamp: this.toTimestamp(comment.created_at),
      replyToId: comment.reply_to_id,
      reactions: {},
      pinned: comment.pinned,
    };
  }

  private toTimestamp(value: Date | string): number {
    return value instanceof Date ? value.getTime() : new Date(value).getTime();
  }
}
