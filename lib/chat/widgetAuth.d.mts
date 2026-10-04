import type { SupabaseClient } from '@supabase/supabase-js'

export declare const TOKEN_HEADER: 'x-chat-token'
export declare const TOKEN_HASH_COLUMN: 'visitor_token_hash'
export declare const DEFAULT_ORIGIN: string
export declare function isConversationId(value: unknown): value is string
export declare function generateVisitorToken(): string
export declare function hashVisitorToken(token: string): Promise<string>
export declare function constantTimeEqual(a: unknown, b: unknown): boolean
export declare function readVisitorToken(request: { headers: Headers }): string | null
export declare function tokenMatches(storedHash: unknown, token: string | null): Promise<boolean>
export declare function corsHeadersFor(request: { headers: Headers }, methods: string): Record<string, string>
export declare function publicConversation<T extends Record<string, unknown>>(row: T | null | undefined): Omit<T, 'visitor_token_hash'> | null
export declare function authorizeConversation(
  db: SupabaseClient,
  conversationId: unknown,
  token: string | null
): Promise<Record<string, unknown> | null>
export interface WidgetPayload {
  conversation: Record<string, unknown> | null
  messages: Record<string, unknown>[]
  queue: { position: number; estimatedWaitMinutes: number }
}
export declare function loadWidgetPayload(
  db: SupabaseClient,
  conversationId: string,
  estimateWaitMinutes: (position: number, agents: number) => number
): Promise<WidgetPayload>
export declare function handleWidgetGet(args: {
  db: SupabaseClient
  conversationId: string
  token: string | null
  estimateWaitMinutes: (position: number, agents: number) => number
}): Promise<{ status: number; body: WidgetPayload | { error: string } }>
