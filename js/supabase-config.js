/* ==========================================================================
   ACADEX SUPABASE STORAGE CONFIGURATION (js/supabase-config.js)
   Initializes Supabase Client via ES Module CDN for object storage.
   ========================================================================== */

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Replace these placeholders with your actual Supabase project credentials from Supabase Dashboard > Project Settings > API
export const SUPABASE_URL = "https://bWlr94wf4MpAbamDyRYuZA.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_bWlr94wf4MpAbamDyRYuZA_3EKzZRiG";

// Initialize Supabase Client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
