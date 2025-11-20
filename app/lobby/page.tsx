import { redirect } from "next/navigation";

export default function LegacyLobby() {
  redirect("/rooms");
}
