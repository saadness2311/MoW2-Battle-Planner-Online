"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const s = getSession();
    if (s) router.replace("/lobby");
    else router.replace("/auth");
  }, []);

  return null;
}
