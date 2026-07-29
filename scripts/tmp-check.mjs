import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const load = (p) => {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
};
load(resolve(root, "apps/mobile/.env.local"));

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL.trim();
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY.trim();
const roster = JSON.parse(
  readFileSync(resolve(root, "packages/config/src/dev/dev-accounts.json"), "utf8"),
);

// 1) Does the anon key the APP uses actually authenticate?
const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "tasker@dev.dizkarte.invalid", password: roster.password }),
});
const body = await res.json();
console.log(`sign-in with roster password: HTTP ${res.status}`);
if (!res.ok) console.log("  ->", JSON.stringify(body));
const token = body.access_token;

// 2) categories while signed OUT (what the app does on the sign-in screen)
const anonCats = await fetch(`${URL_}/rest/v1/categories?select=id&active=eq.true`, {
  headers: { apikey: ANON },
});
console.log(`categories as anon (no user): HTTP ${anonCats.status}`);

// 3) categories while signed IN
if (token) {
  const authCats = await fetch(`${URL_}/rest/v1/categories?select=id,name&active=eq.true`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  });
  console.log(`categories as authenticated: HTTP ${authCats.status}, rows=${authCats.ok ? (await authCats.json()).length : "-"}`);

  // 4) the failing RPC
  const rpc = await fetch(`${URL_}/rest/v1/rpc/derive_user_balances`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_user_id: body.user.id }),
  });
  console.log(`rpc derive_user_balances: HTTP ${rpc.status}`);
}
