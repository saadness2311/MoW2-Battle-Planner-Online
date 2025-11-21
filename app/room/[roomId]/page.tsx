"use client";

import { useParams } from "next/navigation";
import RoomLayout from "@/components/RoomLayout";
import { getSession } from "@/lib/auth";

export default function RoomPage() {
  const params = useParams();
  const roomId = params?.roomId as string;

  const session = getSession();
  if (!session) {
    if (typeof window !== "undefined") {
      window.location.href = "/auth";
    }
    return null;
  }

  return <RoomLayout roomId={roomId} session={session} />;
}
