import "server-only";

// Thin REST client for the two public heqa_* database functions.
// Uses the publishable key: the functions are the only thing it can reach.
export async function rpc<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("config");
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg: string = json?.message ?? "";
    if (["rate_limited", "not_found", "invalid_visit_date"].includes(msg)) throw new Error(msg);
    console.error("rpc", fn, res.status, json);
    throw new Error("generic");
  }
  return json as T;
}
