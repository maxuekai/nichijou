import BetterSqlite3 from "better-sqlite3";
import type { StorageManager } from "../storage/storage.js";

export interface ChatRecord {
  id: number;
  memberId: string;
  role: string;
  content: string;
  createdAt: string;
}

export interface ReminderLog {
  id: number;
  memberId: string;
  routineId: string;
  reminderId: string;
  sentAt: string;
  channel: string;
}

export class Database {
  private db: BetterSqlite3.Database;

  constructor(storage: StorageManager) {
    const dbPath = storage.resolve("db", "nichijou.sqlite");
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        member_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_calls TEXT,
        tool_call_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_chat_member
        ON chat_history(member_id, created_at);

      CREATE TABLE IF NOT EXISTS memory_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        member_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_summary_member
        ON memory_summaries(member_id, created_at);

      CREATE TABLE IF NOT EXISTS reminder_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        member_id TEXT NOT NULL,
        routine_id TEXT NOT NULL,
        reminder_id TEXT NOT NULL,
        sent_at TEXT NOT NULL DEFAULT (datetime('now')),
        channel TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_reminder_member
        ON reminder_logs(member_id, sent_at);

      CREATE TABLE IF NOT EXISTS token_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        member_id TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_token_usage_date
        ON token_usage(created_at);

      CREATE TABLE IF NOT EXISTS conversation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        member_id TEXT NOT NULL,
        user_input TEXT NOT NULL,
        final_reply TEXT NOT NULL,
        events TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_conv_log_member
        ON conversation_logs(member_id, created_at);
    `);
  }

  saveChat(memberId: string, role: string, content: string, toolCalls?: string, toolCallId?: string): void {
    this.db.prepare(
      `INSERT INTO chat_history (member_id, role, content, tool_calls, tool_call_id) VALUES (?, ?, ?, ?, ?)`,
    ).run(memberId, role, content, toolCalls ?? null, toolCallId ?? null);
  }

  getRecentChats(memberId: string, limit = 50): ChatRecord[] {
    return this.db
      .prepare(
        `SELECT id, member_id as memberId, role, content, created_at as createdAt
         FROM chat_history WHERE member_id = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .all(memberId, limit) as ChatRecord[];
  }

  saveSummary(memberId: string, summary: string, periodStart: string, periodEnd: string): void {
    this.db
      .prepare(
        `INSERT INTO memory_summaries (member_id, summary, period_start, period_end) VALUES (?, ?, ?, ?)`,
      )
      .run(memberId, summary, periodStart, periodEnd);
  }

  getLatestSummary(memberId: string): string | null {
    const row = this.db
      .prepare(
        `SELECT summary FROM memory_summaries WHERE member_id = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .get(memberId) as { summary: string } | undefined;
    return row?.summary ?? null;
  }

  logReminder(memberId: string, routineId: string, reminderId: string, channel: string): void {
    this.db
      .prepare(
        `INSERT INTO reminder_logs (member_id, routine_id, reminder_id, channel) VALUES (?, ?, ?, ?)`,
      )
      .run(memberId, routineId, reminderId, channel);
  }

  isReminderSent(memberId: string, reminderId: string, dateStr: string): boolean {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as cnt FROM reminder_logs
         WHERE member_id = ? AND reminder_id = ? AND sent_at >= ?`,
      )
      .get(memberId, reminderId, dateStr) as { cnt: number };
    return row.cnt > 0;
  }

  logTokenUsage(memberId: string, promptTokens: number, completionTokens: number, model: string): void {
    this.db
      .prepare(
        `INSERT INTO token_usage (member_id, prompt_tokens, completion_tokens, model) VALUES (?, ?, ?, ?)`,
      )
      .run(memberId, promptTokens, completionTokens, model);
  }

  getTokenUsage(since: string): { promptTokens: number; completionTokens: number } {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(prompt_tokens), 0) as promptTokens,
                COALESCE(SUM(completion_tokens), 0) as completionTokens
         FROM token_usage WHERE created_at >= ?`,
      )
      .get(since) as { promptTokens: number; completionTokens: number };
    return row;
  }

  saveConversationLog(memberId: string, userInput: string, finalReply: string, events: string): void {
    this.db.prepare(
      `INSERT INTO conversation_logs (member_id, user_input, final_reply, events) VALUES (?, ?, ?, ?)`,
    ).run(memberId, userInput, finalReply, events);
  }

  getConversationLogs(memberId: string, limit = 50): Array<{
    id: number;
    memberId: string;
    userInput: string;
    finalReply: string;
    events: string;
    createdAt: string;
  }> {
    return this.db
      .prepare(
        `SELECT id, member_id as memberId, user_input as userInput, final_reply as finalReply,
                events, created_at as createdAt
         FROM conversation_logs WHERE member_id = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .all(memberId, limit) as Array<{
        id: number;
        memberId: string;
        userInput: string;
        finalReply: string;
        events: string;
        createdAt: string;
      }>;
  }

  getAllConversationLogs(limit = 100): Array<{
    id: number;
    memberId: string;
    userInput: string;
    finalReply: string;
    events: string;
    createdAt: string;
  }> {
    return this.db
      .prepare(
        `SELECT id, member_id as memberId, user_input as userInput, final_reply as finalReply,
                events, created_at as createdAt
         FROM conversation_logs ORDER BY created_at DESC LIMIT ?`,
      )
      .all(limit) as Array<{
        id: number;
        memberId: string;
        userInput: string;
        finalReply: string;
        events: string;
        createdAt: string;
      }>;
  }

  cleanOldChats(daysToKeep = 30): number {
    const result = this.db
      .prepare(
        `DELETE FROM chat_history WHERE created_at < datetime('now', ?)`,
      )
      .run(`-${daysToKeep} days`);
    return result.changes;
  }

  close(): void {
    this.db.close();
  }
}
