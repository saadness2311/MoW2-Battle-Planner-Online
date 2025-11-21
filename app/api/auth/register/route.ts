import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdminClient";

function normalizeNickname(nickname: string) {
  return nickname.trim();
}

function buildHiddenEmail(nickname: string) {
  // Use a deterministic, globally valid domain to satisfy Supabase email validation
  // while keeping the UI nickname-only. If AUTH_EMAIL_DOMAIN is not provided, fall
  // back to a safe example TLD instead of any ".local" suffixes that trigger
  // "invalid email" errors on the platform.
  const configuredDomain = process.env.AUTH_EMAIL_DOMAIN;
  const fallbackDomain = "mowbp.example.com";

  const safeDomain = (() => {
    if (!configuredDomain) return fallbackDomain;
    try {
      const parsed = new URL(
        configuredDomain.startsWith("http")
          ? configuredDomain
          : `https://${configuredDomain}`,
      );
      return parsed.hostname || fallbackDomain;
    } catch {
      return configuredDomain.includes(".") ? configuredDomain : fallbackDomain;
    }
  })();

  const slug = nickname
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "user";

  const rand = randomUUID().replace(/-/g, "").slice(0, 6);
  return `${slug}-${rand}@${safeDomain}`;
}

function normalizePassword(password: string) {
  return password.length >= 6 ? password : password.padEnd(6, "*");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const nickname = normalizeNickname(String(body.nickname || ""));
    const password = normalizePassword(String(body.password || ""));

    if (nickname.length < 3) {
      return new NextResponse("Ник минимум 3 символа", { status: 400 });
    }
    if (!password || password.length < 1) {
      return new NextResponse("Пароль минимум 1 символ", { status: 400 });
    }

    const email = buildHiddenEmail(nickname);

    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("nickname", nickname)
      .maybeSingle();
    if (existing) {
      return new NextResponse("Такой ник уже существует", { status: 400 });
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nickname },
    });

    if (createError || !created.user) {
      console.error("admin.createUser error", createError);
      return new NextResponse(createError?.message || "Ошибка регистрации", { status: 400 });
    }

    const userId = created.user.id;

    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, nickname, auth_email: email })
      .eq("id", userId);

    if (profileErr) {
      console.error("profile upsert error", profileErr);
      return new NextResponse("Не удалось сохранить профиль", { status: 400 });
    }

    return NextResponse.json({ email });
  } catch (e: any) {
    console.error("Registration API error", e);
    return new NextResponse("Ошибка регистрации", { status: 400 });
  }
}
