'use server'

import { getClerkUserId } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import type { Order, OrderItem, OrderStatus, OrderStatusHistory } from '@/lib/types'

async function requireProfile(db: ReturnType<typeof createSupabaseAdminClient>) {
  const userId = await getClerkUserId()
  if (!userId) throw new Error('Unauthorized')

  const { data: profile } = await db
    .from('profiles')
    .select('*')
    .eq('clerk_user_id', userId)
    .single()

  if (!profile) throw new Error('Profile not found')
  return profile
}

// ── Cart ──────────────────────────────────────────────────────────────────────

export async function getOrCreateCart(): Promise<Order> {
  const db = createSupabaseAdminClient()
  const profile = await requireProfile(db)

  const { data: existing } = await db
    .from('orders')
    .select('*, items:order_items(*, service:services(*))')
    .eq('client_id', profile.id)
    .eq('status', 'cart')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existing) return existing as Order

  const { data: created, error } = await db
    .from('orders')
    .insert({ client_id: profile.id, status: 'cart' })
    .select('*, items:order_items(*, service:services(*))')
    .single()

  if (error) throw error
  return created as Order
}

export async function addToCart(serviceId: string, quantity = 1): Promise<void> {
  const db = createSupabaseAdminClient()
  const cart = await getOrCreateCart()

  const { data: service } = await db
    .from('services')
    .select('price')
    .eq('id', serviceId)
    .single()

  if (!service) throw new Error('Service not found')

  const unitPrice = service.price
  const subtotal = unitPrice * quantity

  // Upsert item
  const { data: existingItem } = await db
    .from('order_items')
    .select('*')
    .eq('order_id', cart.id)
    .eq('service_id', serviceId)
    .single()

  if (existingItem) {
    await db
      .from('order_items')
      .update({
        quantity: existingItem.quantity + quantity,
        subtotal: existingItem.unit_price * (existingItem.quantity + quantity),
      })
      .eq('id', existingItem.id)
  } else {
    await db.from('order_items').insert({
      order_id: cart.id,
      service_id: serviceId,
      quantity,
      unit_price: unitPrice,
      subtotal,
    })
  }

  await recalcOrderTotal(cart.id)
  revalidatePath('/client/services')
}

export async function removeCartItem(itemId: string): Promise<void> {
  const db = createSupabaseAdminClient()
  const profile = await requireProfile(db)

  const { data: item } = await db
    .from('order_items')
    .select('order_id, orders!inner(client_id)')
    .eq('id', itemId)
    .single()

  if (!item) throw new Error('Item not found')

  await db.from('order_items').delete().eq('id', itemId)
  await recalcOrderTotal((item as { order_id: string }).order_id)
  revalidatePath('/client')
}

async function recalcOrderTotal(orderId: string): Promise<void> {
  const db = createSupabaseAdminClient()
  const { data: items } = await db
    .from('order_items')
    .select('subtotal')
    .eq('order_id', orderId)

  const total = (items ?? []).reduce(
    (sum: number, i: { subtotal: number }) => sum + i.subtotal,
    0
  )

  await db
    .from('orders')
    .update({ total_amount: total })
    .eq('id', orderId)
}

export async function placeOrder(
  orderId: string,
  requirements: string
): Promise<void> {
  const db = createSupabaseAdminClient()
  const profile = await requireProfile(db)

  const { data: order } = await db
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('client_id', profile.id)
    .eq('status', 'cart')
    .single()

  if (!order) throw new Error('Cart not found')

  await db
    .from('orders')
    .update({ status: 'queued', requirements })
    .eq('id', order.id)

  await db.from('order_status_history').insert({
    order_id: order.id,
    from_status: 'cart',
    to_status: 'queued',
    changed_by_id: profile.id,
    note: 'Order placed by client',
  })

  revalidatePath('/client/orders')
}

// ── Client ────────────────────────────────────────────────────────────────────

export async function getClientOrders(): Promise<Order[]> {
  const db = createSupabaseAdminClient()
  const profile = await requireProfile(db)

  const { data } = await db
    .from('orders')
    .select(
      '*, consultant:profiles!orders_consultant_id_fkey(*), items:order_items(*, service:services(*))'
    )
    .eq('client_id', profile.id)
    .neq('status', 'cart')
    .order('created_at', { ascending: false })

  return (data as Order[]) ?? []
}

export async function approveOrder(orderId: string): Promise<void> {
  const db = createSupabaseAdminClient()
  const profile = await requireProfile(db)

  await db
    .from('orders')
    .update({ status: 'approved' })
    .eq('id', orderId)
    .eq('client_id', profile.id)
    .eq('status', 'submitted')

  await db.from('order_status_history').insert({
    order_id: orderId,
    from_status: 'submitted',
    to_status: 'approved',
    changed_by_id: profile.id,
    note: 'Approved by client',
  })

  revalidatePath('/client/orders')
}

export async function markDelivered(orderId: string): Promise<void> {
  const db = createSupabaseAdminClient()
  const profile = await requireProfile(db)

  await db
    .from('orders')
    .update({ status: 'delivered' })
    .eq('id', orderId)
    .eq('client_id', profile.id)
    .eq('status', 'approved')

  await db.from('order_status_history').insert({
    order_id: orderId,
    from_status: 'approved',
    to_status: 'delivered',
    changed_by_id: profile.id,
  })

  revalidatePath('/client/orders')
}

// ── Consultant ────────────────────────────────────────────────────────────────

export async function getAvailableOrders(): Promise<Order[]> {
  const db = createSupabaseAdminClient()
  await requireProfile(db)

  const { data } = await db
    .from('orders')
    .select(
      '*, client:profiles!orders_client_id_fkey(*), items:order_items(*, service:services(*))'
    )
    .eq('status', 'queued')
    .order('created_at', { ascending: true })

  return (data as Order[]) ?? []
}

export async function claimOrder(orderId: string): Promise<void> {
  const db = createSupabaseAdminClient()
  const profile = await requireProfile(db)

  const { data: order } = await db
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('status', 'queued')
    .single()

  if (!order) throw new Error('Order not available')

  await db
    .from('orders')
    .update({ consultant_id: profile.id, status: 'claimed' })
    .eq('id', orderId)

  await db.from('order_status_history').insert({
    order_id: orderId,
    from_status: 'queued',
    to_status: 'claimed',
    changed_by_id: profile.id,
    note: `Claimed by ${profile.full_name ?? profile.email}`,
  })

  revalidatePath('/consultant')
}

export async function startProcessing(orderId: string): Promise<void> {
  const db = createSupabaseAdminClient()
  const profile = await requireProfile(db)

  await db
    .from('orders')
    .update({ status: 'processing' })
    .eq('id', orderId)
    .eq('consultant_id', profile.id)
    .eq('status', 'claimed')

  await db.from('order_status_history').insert({
    order_id: orderId,
    from_status: 'claimed',
    to_status: 'processing',
    changed_by_id: profile.id,
  })

  revalidatePath('/consultant/my-orders')
}

export async function submitOrder(
  orderId: string,
  deliveryUrl: string,
  deliveryNotes: string
): Promise<void> {
  const db = createSupabaseAdminClient()
  const profile = await requireProfile(db)

  await db
    .from('orders')
    .update({
      status: 'submitted',
      delivery_url: deliveryUrl,
      delivery_notes: deliveryNotes,
    })
    .eq('id', orderId)
    .eq('consultant_id', profile.id)

  await db.from('order_status_history').insert({
    order_id: orderId,
    from_status: 'processing',
    to_status: 'submitted',
    changed_by_id: profile.id,
    note: 'Work submitted for review',
  })

  revalidatePath('/consultant/my-orders')
}

export async function getConsultantOrders(): Promise<Order[]> {
  const db = createSupabaseAdminClient()
  const profile = await requireProfile(db)

  const { data } = await db
    .from('orders')
    .select(
      '*, client:profiles!orders_client_id_fkey(*), items:order_items(*, service:services(*))'
    )
    .eq('consultant_id', profile.id)
    .order('updated_at', { ascending: false })

  return (data as Order[]) ?? []
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export async function getAllOrders(): Promise<Order[]> {
  const db = createSupabaseAdminClient()
  const profile = await requireProfile(db)

  if (profile.role !== 'admin') throw new Error('Forbidden')

  const { data } = await db
    .from('orders')
    .select(
      '*, client:profiles!orders_client_id_fkey(*), consultant:profiles!orders_consultant_id_fkey(*), items:order_items(*, service:services(*))'
    )
    .order('created_at', { ascending: false })

  return (data as Order[]) ?? []
}

export async function adminUpdateStatus(
  orderId: string,
  status: OrderStatus,
  note?: string
): Promise<void> {
  const db = createSupabaseAdminClient()
  const profile = await requireProfile(db)

  if (profile.role !== 'admin') throw new Error('Forbidden')

  const { data: order } = await db
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .single()

  await db.from('orders').update({ status }).eq('id', orderId)

  await db.from('order_status_history').insert({
    order_id: orderId,
    from_status: order?.status ?? null,
    to_status: status,
    changed_by_id: profile.id,
    note: note ?? `Status updated by admin`,
  })

  revalidatePath('/admin/orders')
}

// ── Shared ────────────────────────────────────────────────────────────────────

export async function getOrderById(orderId: string): Promise<Order | null> {
  const db = createSupabaseAdminClient()

  const { data } = await db
    .from('orders')
    .select(
      '*, client:profiles!orders_client_id_fkey(*), consultant:profiles!orders_consultant_id_fkey(*), items:order_items(*, service:services(*))'
    )
    .eq('id', orderId)
    .single()

  return (data as Order) ?? null
}

export async function getOrderHistory(orderId: string): Promise<OrderStatusHistory[]> {
  const db = createSupabaseAdminClient()

  const { data } = await db
    .from('order_status_history')
    .select('*, changed_by:profiles(*)')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })

  return (data as OrderStatusHistory[]) ?? []
}
