import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRole) {
  console.warn(
    "Supabase service role or URL missing. API routes depending on admin client will fail."
  );
}

export const supabaseAdmin = createClient(
  supabaseUrl || "http://localhost:54321",
  serviceRole || "service-role-key"
);
