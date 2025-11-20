"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function HomePage() {
  useEffect(() => {
    async function redirect() {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        window.location.replace("/rooms");
      } else {
        window.location.replace("/login");
      }
    }
    redirect();
  }, []);

  return null;
}
