// Edge Function: admin-grant-vip
// Permite que Dev/GM concedam VIP manualmente a um jogador (sem pagamento real),
// pra testes ou casos especiais. Chamada a partir da aba "Cargos" do painel do jogo.
//
// Observação sobre segurança: essa função confia no que o jogo manda (não há como
// verificar aqui, dentro do Supabase, se quem chamou é realmente Dev/GM no Firebase,
// já que os dois sistemas são separados). A proteção real está em só mostrar esse
// botão na interface pra quem tem o cargo — a mesma lógica de confiança que o resto
// do jogo já usa. Se um dia isso virar um problema, dá pra reforçar ligando essa
// função direto na autenticação do Firebase.

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
const DURATION_DAYS: Record<string, number> = {
  "1week": 7, "1month": 30, "5months": 150, "1year": 365, "2years": 730,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { targetUid, tier, grantedBy } = await req.json();
    if (!targetUid || !DURATION_DAYS[tier]) {
      return new Response(JSON.stringify({ error: "targetUid ou tier inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existing } = await supabase.from("vip_status").select("*").eq("uid", targetUid).maybeSingle();
    const now = Date.now();
    const base = (existing?.active_until && existing.active_until > now) ? existing.active_until : now;
    const activeUntil = base + DURATION_DAYS[tier] * 86400 * 1000;
    const history = Array.isArray(existing?.history) ? existing.history : [];
    history.push({ tier, purchasedAt: now, manual: true, grantedBy: grantedBy || null });

    await supabase.from("vip_status").upsert({
      uid: targetUid, tier, active_until: activeUntil, history, updated_at: now,
    });

    return new Response(JSON.stringify({ ok: true, active_until: activeUntil }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("erro admin-grant-vip:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
