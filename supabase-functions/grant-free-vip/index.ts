// Edge Function: grant-free-vip
// Dá a semana de VIP grátis pra quem fez 6 meses jogados e comprou algum VIP
// nos últimos 3 meses (o próprio jogo já confere essa condição antes de chamar
// essa função — aqui só evitamos que a mesma pessoa ganhe o bônus 2 vezes).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { uid } = await req.json();
    if (!uid) {
      return new Response(JSON.stringify({ error: "uid faltando" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existing } = await supabase.from("vip_status").select("*").eq("uid", uid).maybeSingle();
    if (existing?.freeGrant6moUsed) {
      return new Response(JSON.stringify({ error: "bônus já usado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = Date.now();
    const base = (existing?.active_until && existing.active_until > now) ? existing.active_until : now;
    const activeUntil = base + 7 * 86400 * 1000;
    const history = Array.isArray(existing?.history) ? existing.history : [];
    history.push({ tier: "1week", purchasedAt: now, free: true });

    await supabase.from("vip_status").upsert({
      uid,
      tier: existing?.tier || "1week",
      active_until: activeUntil,
      history,
      freeGrant6moUsed: true,
      updated_at: now,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("erro grant-free-vip:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
