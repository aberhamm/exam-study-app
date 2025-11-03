-- Supabase Schema Setup for SCXMCL Study Util
-- Run this in your Supabase SQL Editor

-- Create invites table for invite-only registration
CREATE TABLE IF NOT EXISTS public.invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  app_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  tier TEXT NOT NULL DEFAULT 'free',
  invited_by UUID REFERENCES auth.users(id),
  claimed BOOLEAN DEFAULT FALSE,
  claimed_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add RLS policies for invites table
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- Admins can create invites
CREATE POLICY "Admins can create invites"
  ON public.invites
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (
        (raw_app_meta_data->>'claims_admin')::boolean = true
        OR (raw_app_meta_data->'apps'->app_id->>'role') = 'admin'
      )
    )
  );

-- Users can view invites for their email
CREATE POLICY "Users can view invites for their email"
  ON public.invites
  FOR SELECT
  USING (
    email = auth.jwt()->>'email'
    OR invited_by = auth.uid()
    OR (
      EXISTS (
        SELECT 1 FROM auth.users
        WHERE auth.users.id = auth.uid()
        AND (
          (raw_app_meta_data->>'claims_admin')::boolean = true
          OR (raw_app_meta_data->'apps'->app_id->>'role') = 'admin'
        )
      )
    )
  );

-- Admins can update invites
CREATE POLICY "Admins can update invites"
  ON public.invites
  FOR UPDATE
  USING (
    invited_by = auth.uid()
    OR (
      EXISTS (
        SELECT 1 FROM auth.users
        WHERE auth.users.id = auth.uid()
        AND (
          (raw_app_meta_data->>'claims_admin')::boolean = true
          OR (raw_app_meta_data->'apps'->app_id->>'role') = 'admin'
        )
      )
    )
  );

-- Admins can delete invites
CREATE POLICY "Admins can delete invites"
  ON public.invites
  FOR DELETE
  USING (
    invited_by = auth.uid()
    OR (
      EXISTS (
        SELECT 1 FROM auth.users
        WHERE auth.users.id = auth.uid()
        AND (
          (raw_app_meta_data->>'claims_admin')::boolean = true
          OR (raw_app_meta_data->'apps'->app_id->>'role') = 'admin'
        )
      )
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS invites_email_idx ON public.invites(email);
CREATE INDEX IF NOT EXISTS invites_app_id_idx ON public.invites(app_id);
CREATE INDEX IF NOT EXISTS invites_expires_at_idx ON public.invites(expires_at);
CREATE INDEX IF NOT EXISTS invites_claimed_idx ON public.invites(claimed);

-- Function to clean up expired invites (optional)
CREATE OR REPLACE FUNCTION cleanup_expired_invites()
RETURNS void AS $$
BEGIN
  DELETE FROM public.invites
  WHERE expires_at < NOW() AND claimed = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_invites_updated_at
    BEFORE UPDATE ON public.invites
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

