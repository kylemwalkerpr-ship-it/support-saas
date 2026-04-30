'use server'

import { auth } from '@clerk/nextjs/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import type { Service } from '@/lib/types'

export async function getServices(): Promise<Service[]> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from('services')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  return (data as Service[]) ?? []
}

export async function getAllServices(): Promise<Service[]> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from('services')
    .select('*')
    .order('created_at', { ascending: false })

  return (data as Service[]) ?? []
}

export async function createService(input: {
  title: string
  description: string
  price: number
  delivery_days: number
  category: string
  features: string[]
}): Promise<Service> {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')

  const db = createSupabaseAdminClient()
  const { data: me } = await db
    .from('profiles')
    .select('role')
    .eq('clerk_user_id', userId)
    .single()

  if (me?.role !== 'admin') throw new Error('Forbidden')

  const { data, error } = await db
    .from('services')
    .insert(input)
    .select('*')
    .single()

  if (error) throw error
  return data as Service
}

export async function toggleServiceActive(
  serviceId: string,
  is_active: boolean
): Promise<void> {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')

  const db = createSupabaseAdminClient()
  const { data: me } = await db
    .from('profiles')
    .select('role')
    .eq('clerk_user_id', userId)
    .single()

  if (me?.role !== 'admin') throw new Error('Forbidden')

  await db.from('services').update({ is_active }).eq('id', serviceId)
}
