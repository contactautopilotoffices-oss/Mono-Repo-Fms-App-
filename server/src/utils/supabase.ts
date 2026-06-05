/**
 * Supabase Server Client — FMS Data (Expo project)
 * =================================================
 *
 * Uses the Expo/FMS Supabase project for all facility management data:
 * tickets, properties, memberships, etc.
 */

import { createClient } from '@supabase/supabase-js';

// FMS/Expo project — where tickets, properties, users live
// Uses same Supabase project as the mobile app (xvucakstcmtfoanmgcql)
const fmsSupabaseUrl = process.env.FMS_SUPABASE_URL || process.env.SUPABASE_URL;
const fmsServiceRoleKey = process.env.FMS_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const fmsAnonKey = process.env.FMS_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!fmsSupabaseUrl || !fmsServiceRoleKey || !fmsAnonKey) {
  throw new Error(
    `Missing FMS Supabase credentials. FMS_SUPABASE_URL=${!!fmsSupabaseUrl}, FMS_SUPABASE_SERVICE_ROLE_KEY=${!!fmsServiceRoleKey}, FMS_SUPABASE_ANON_KEY=${!!fmsAnonKey}`
  );
}

/**
 * Admin client (service role) for FMS data.
 * Can read all tenant data without RLS restrictions.
 */
export const supabaseAdmin = createClient(fmsSupabaseUrl, fmsServiceRoleKey);

/**
 * Anon client for FMS data — respects RLS policies.
 */
export const supabaseAnon = createClient(fmsSupabaseUrl, fmsAnonKey);
