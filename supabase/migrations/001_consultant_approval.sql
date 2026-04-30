-- Migration: Consultant approval system
-- Run this in your Supabase SQL Editor

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'pending', 'suspended'));

-- Existing consultants are grandfathered in as active
-- New consultants will be set to 'pending' by the onboarding flow
