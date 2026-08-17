/* ==========================================================================
   ACADEX SUPABASE STORAGE CONFIGURATION (js/supabase-config.js)
   Initializes Supabase Client via ES Module CDN for object storage.
   ========================================================================== */

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Replace these placeholders with your actual Supabase project credentials from Supabase Dashboard > Project Settings > API
export const SUPABASE_URL = "https://acadex-storage.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjYWRleC1zdG9yYWdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MjAxNTAwMDAwMH0.placeholder";

// Initialize Supabase Client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
