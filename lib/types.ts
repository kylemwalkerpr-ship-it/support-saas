export type Role = 'client' | 'consultant' | 'support' | 'admin'
export type ProfileStatus = 'active' | 'pending' | 'suspended'

export type OrderStatus =
  | 'cart'
  | 'queued'
  | 'claimed'
  | 'processing'
  | 'submitted'
  | 'approved'
  | 'delivered'
  | 'cancelled'

export interface Profile {
  id: string
  clerk_user_id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: Role
  status: ProfileStatus
  bio: string | null
  created_at: string
  updated_at: string
}

export interface Service {
  id: string
  title: string
  description: string | null
  price: number
  delivery_days: number
  category: string
  features: string[]
  is_active: boolean
  created_at: string
}

export interface Order {
  id: string
  order_number: string
  client_id: string
  consultant_id: string | null
  status: OrderStatus
  total_amount: number
  requirements: string | null
  delivery_url: string | null
  delivery_notes: string | null
  created_at: string
  updated_at: string
  client?: Profile
  consultant?: Profile
  items?: OrderItem[]
}

export interface OrderItem {
  id: string
  order_id: string
  service_id: string
  quantity: number
  unit_price: number
  subtotal: number
  created_at: string
  service?: Service
}

export interface OrderStatusHistory {
  id: string
  order_id: string
  from_status: OrderStatus | null
  to_status: OrderStatus
  changed_by_id: string
  note: string | null
  created_at: string
  changed_by?: Profile
}

export interface Notification {
  id: string
  user_id: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  is_read: boolean
  order_id: string | null
  created_at: string
}

export type ChatConversationStatus =
  | 'ai_active'
  | 'waiting_for_agent'
  | 'assigned'
  | 'resolved'
  | 'closed'

export type ChatSenderType = 'visitor' | 'ai' | 'agent' | 'system'

export interface ChatConversation {
  id: string
  visitor_name: string | null
  visitor_email: string | null
  visitor_phone: string | null
  topic: string
  status: ChatConversationStatus
  priority: 'low' | 'normal' | 'high' | 'urgent'
  assigned_to_id: string | null
  last_message: string | null
  last_message_at: string
  requested_agent_at: string | null
  resolved_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  assigned_to?: Profile | null
}

export interface ChatMessage {
  id: string
  conversation_id: string
  sender_type: ChatSenderType
  sender_id: string | null
  sender_name: string | null
  body: string
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface ChatNotification {
  id: string
  conversation_id: string | null
  target_email: string
  title: string
  message: string
  is_read: boolean
  created_at: string
}

// ============================================================
// Support staff parity — Phase 1 domain types
// ============================================================

export type SupportActorRole = 'support' | 'admin'

export type DisputeStatus =
  | 'open'
  | 'triage'
  | 'resolved_refund'
  | 'resolved_release'
  | 'resolved_split'
  | 'rejected'

export type ModerationCategory = 'spam' | 'abuse' | 'scam' | 'duplicate' | 'other'

export type ModerationTargetType = 'gig' | 'message' | 'review' | 'profile'

export type ModerationStatus = 'pending' | 'dismissed' | 'actioned'

export type NotificationType =
  | 'new_dispute'
  | 'new_verification'
  | 'flag_raised'
  | 'assignment'
  | 'audit'
  | 'system'

export interface SupportAuditLogEntry {
  id: string
  actor_id: string
  actor_role: SupportActorRole
  action: string
  target_type: string
  target_id: string
  reason: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface SupportMacro {
  id: string
  owner_id: string | null
  title: string
  body: string
  tags: string[]
  language: string
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface Dispute {
  id: string
  order_id: string
  opened_by: string
  opened_by_role: string
  against_id: string
  against_role: string
  reason: string
  status: DisputeStatus
  resolution_notes: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export interface ModerationFlag {
  id: string
  flagger_id: string | null
  target_type: ModerationTargetType
  target_id: string
  reason: string
  category: ModerationCategory
  status: ModerationStatus
  decided_by: string | null
  decided_at: string | null
  created_at: string
  updated_at: string
}

export interface SupportNotification {
  id: string
  recipient_id: string
  type: NotificationType | string
  subject_type: string | null
  subject_id: string | null
  title: string
  body: string | null
  read_at: string | null
  created_at: string
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  cart: 'In Cart',
  queued: 'Queued',
  claimed: 'Claimed',
  processing: 'In Progress',
  submitted: 'Submitted',
  approved: 'Approved',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  cart: 'bg-gray-100 text-gray-700 border-gray-200',
  queued: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  claimed: 'bg-blue-50 text-blue-700 border-blue-200',
  processing: 'bg-purple-50 text-purple-700 border-purple-200',
  submitted: 'bg-orange-50 text-orange-700 border-orange-200',
  approved: 'bg-teal-50 text-teal-700 border-teal-200',
  delivered: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
}
