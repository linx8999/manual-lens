import { randomUUID } from "node:crypto";
import type {
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
  MessageStatus
} from "../../shared/types";
import type { AppDatabase } from "../storage/database";

interface ConversationRow {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  message_count: number;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  status: string;
  citations_json: string;
  created_at: number;
}

export class ConversationStore {
  constructor(private readonly database: AppDatabase) {}

  create(title: string): ConversationSummary {
    const id = randomUUID();
    const now = Date.now();
    const normalizedTitle = title.replace(/\s+/g, " ").trim().slice(0, 48) || "新对话";
    this.database.run(
      `INSERT INTO conversations (id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
      id,
      normalizedTitle,
      now,
      now
    );
    return { id, title: normalizedTitle, createdAt: now, updatedAt: now, messageCount: 0 };
  }

  list(): ConversationSummary[] {
    return this.database
      .query<ConversationRow>(
        `SELECT c.*, COUNT(m.id) AS message_count
         FROM conversations c
         LEFT JOIN messages m ON m.conversation_id = c.id
         GROUP BY c.id
         ORDER BY c.updated_at DESC`
      )
      .map((row) => ({
        id: row.id,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        messageCount: row.message_count
      }));
  }

  get(conversationId: string): ConversationDetail {
    const conversation = this.database.query<ConversationRow>(
      "SELECT * FROM conversations WHERE id = ?",
      conversationId
    )[0];
    if (!conversation) {
      throw new Error("未找到指定会话。");
    }

    const messages = this.database
      .query<MessageRow>(
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at, rowid",
        conversationId
      )
      .map(mapMessageRow);

    return {
      id: conversation.id,
      title: conversation.title,
      messages
    };
  }

  addMessage(
    conversationId: string,
    role: ChatMessage["role"],
    content: string,
    status: MessageStatus
  ): ChatMessage {
    const message: ChatMessage = {
      id: randomUUID(),
      conversationId,
      role,
      content,
      status,
      citations: [],
      createdAt: Date.now()
    };
    this.database.run(
      `INSERT INTO messages (
        id, conversation_id, role, content, status, citations_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      message.id,
      message.conversationId,
      message.role,
      message.content,
      message.status,
      "[]",
      message.createdAt
    );
    this.touch(conversationId);
    return message;
  }

  updateMessage(
    messageId: string,
    content: string,
    status: MessageStatus,
    citations: ChatMessage["citations"]
  ): void {
    this.database.run(
      `UPDATE messages
       SET content = ?, status = ?, citations_json = ?
       WHERE id = ?`,
      content,
      status,
      JSON.stringify(citations),
      messageId
    );
  }

  delete(conversationId: string): void {
    this.database.run("DELETE FROM conversations WHERE id = ?", conversationId);
  }

  private touch(conversationId: string): void {
    this.database.run(
      "UPDATE conversations SET updated_at = ? WHERE id = ?",
      Date.now(),
      conversationId
    );
  }
}

function mapMessageRow(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as ChatMessage["role"],
    content: row.content,
    status: row.status as MessageStatus,
    citations: JSON.parse(row.citations_json) as ChatMessage["citations"],
    createdAt: row.created_at
  };
}
