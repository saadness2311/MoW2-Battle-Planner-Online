export type Room = {
  id: string;
  name: string;
  owner_id: string;
  password_hash: string | null;
  description?: string | null;
  created_at: string;
  current_turn_user_id: string | null;
  editing_user_id: string | null;
  map_id: string | null;
  max_players: number;
  is_locked: boolean;
};

export type RoomPlayer = {
  id: string;
  room_id: string;
  user_id: string;
  joined_at: string;
  last_seen_at: string;
  is_active: boolean;
  role: string;
  nickname: string;
};
