"use client";

import { useEffect, useState } from "react";
import {
  signInWithNickname,
  signOut,
  signUpWithNickname,
  getCurrentProfile,
} from "@/lib/auth";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState<"login" | "register">(mode);

  useEffect(() => {
    setCurrentMode(mode);
  }, [mode]);

  useEffect(() => {
    // If already authenticated redirect to rooms
    getCurrentProfile().then((profile) => {
      if (profile && typeof window !== "undefined") {
        window.location.href = "/rooms";
      }
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (nickname.trim().length < 3) {
      setError("Ник минимум 3 символа");
      return;
    }
    if (password.length < 1) {
      setError("Пароль минимум 1 символ");
      return;
    }

    try {
      if (currentMode === "register") {
        await signUpWithNickname(nickname.trim(), password);
      } else {
        await signInWithNickname(nickname.trim(), password);
      }
      window.location.href = "/rooms";
    } catch (err: any) {
      setError(err?.message || "Ошибка авторизации");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-900">
      <form
        onSubmit={handleSubmit}
        className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 w-full max-w-sm flex flex-col gap-4"
      >
        <h1 className="text-xl font-bold text-center">
          MoW Battle Planner Online
        </h1>

        <div className="flex gap-2 text-sm justify-center">
          <button
            type="button"
            onClick={() => setCurrentMode("register")}
            className={`px-3 py-1 rounded ${
              currentMode === "register" ? "bg-neutral-700" : "bg-neutral-900"
            }`}
          >
            Регистрация
          </button>
          <button
            type="button"
            onClick={() => setCurrentMode("login")}
            className={`px-3 py-1 rounded ${
              currentMode === "login" ? "bg-neutral-700" : "bg-neutral-900"
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
          {currentMode === "register" ? "Создать аккаунт" : "Войти"}
        </button>

        <button
          type="button"
          className="text-xs text-neutral-400 hover:text-neutral-200"
          onClick={() => signOut()}
        >
          Сбросить локальную сессию
        </button>
      </form>
    </div>
  );
}
