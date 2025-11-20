"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import RoomLayout from "@/components/RoomLayout";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentProfile } from "@/lib/auth";

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params?.roomId as string;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function check() {
      const { data } = await supabase.auth.getSession();
      const profile = await getCurrentProfile();
      if (!data.session || !profile) {
        router.replace("/login");
        return;
      }
      setReady(true);
    }
    check();
  }, [router]);

  if (!ready || !roomId) {
    return (
      <div className="h-screen w-screen bg-[#15171c] text-gray-100 flex items-center justify-center">
        <div className="text-sm text-zinc-400">Загрузка комнаты...</div>
      </div>
    );
  }

  return <RoomLayout roomId={roomId} />;
}
