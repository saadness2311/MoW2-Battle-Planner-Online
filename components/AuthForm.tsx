"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { hashPassword } from "@/lib/hashPassword";
import { setSession } from "@/lib/auth";

export default function AuthForm() {
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("register");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (nickname.trim().length < 3) {
      setError("Никнейм минимум 3 символа");
      return;
    }
    if (password.length < 1) {
      setError("Пароль минимум 1 символ");
      return;
    }

    const passHash = await hashPassword(password);

    if (mode === "register") {
      const { data, error } = await supabase
        .from("users")
        .insert({ nickname, password_hash: passHash })
        .select("id, nickname")
        .single();

      if (error) {
        setError(error.message);
        return;
      }

      setSession({ userId: data.id, nickname: data.nickname });
      window.location.href = "/lobby";
    } else {
      const { data, error } = await supabase
        .from("users")
        .select("id, nickname, password_hash")
        .eq("nickname", nickname)
        .single();

      if (error || !data) {
        setError("Неверный никнейм или пароль");
        return;
      }
      if (data.password_hash !== passHash) {
        setError("Неверный никнейм или пароль");
        return;
      }

      setSession({ userId: data.id, nickname: data.nickname });
      window.location.href = "/lobby";
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-900">
      <form
        onSubmit={handleSubmit}
        className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 w-full max-w-sm flex flex-col gap-4"
      >
        <h1 className="text-xl font-bold text-center">
          Men of War 2 Battle Planner Online
        </h1>

        <div className="flex gap-2 text-sm justify-center">
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`px-3 py-1 rounded ${
              mode === "register" ? "bg-neutral-700" : "bg-neutral-900"
            }`}
          >
            Регистрация
          </button>
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`px-3 py-1 rounded ${
              mode === "login" ? "bg-neutral-700" : "bg-neutral-900"
            }`}
          >
            Вход
          </button>
        </div>

        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Никнейм"
          className="px-3 py-2 rounded bg-neutral-900 border border-neutral-700 text-sm"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Пароль"
          type="password"
          className="px-3 py-2 rounded bg-neutral-900 border border-neutral-700 text-sm"
        />

        {error && <div className="text-red-400 text-sm">{error}</div>}

        <button
          type="submit"
          className="mt-2 px-3 py-2 rounded bg-green-600 hover:bg-green-500 text-sm font-semibold"
        >
          {mode === "register" ? "Создать аккаунт" : "Войти"}
        </button>
      </form>
    </div>
  );
}
