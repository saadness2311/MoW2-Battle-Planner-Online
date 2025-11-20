"use client";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const resolvedUrl = supabaseUrl || "http://localhost:54321";
const resolvedKey = supabaseAnonKey || "public-anon-key";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing. Using fallback values for build-time safety.",
  );
}

export const supabase = createClient(resolvedUrl, resolvedKey);
