// Edge Function: mp-webhook
// O Mercado Pago chama essa URL sozinho quando o status de um pagamento muda.
// Aqui a gente CONFERE de verdade com a API do Mercado Pago (nunca confia direto
// no que a notificação manda) e só libera o VIP se o pagamento estiver "approved".
//
// Variáveis de ambiente necessárias:
//   MP_ACCESS_TOKEN → mesmo Access Token da outra função
// (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm prontas automaticamente, não precisa configurar)

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const DURATION_DAYS: Record<string, number> = {
  "1week": 7, "1month": 30, "5months": 150, "1year": 365, "2years": 730,
};

serve(async (req) => {
  try {
    const url = new URL(req.url);
    let paymentId = url.searchParams.get("data.id") || url.searchParams.get("id");
    if (!paymentId && (req.method === "POST")) {
      try {
        const body = await req.json();
        paymentId = body?.data?.id || body?.id || null;
      } catch (_e) { /* corpo vazio, sem problema */ }
    }
    if (!paymentId) return new Response("ok", { status: 200 }); // notificação que não é de pagamento, ignora

    // busca os dados REAIS do pagamento direto na API do Mercado Pago — nunca confiamos
    // em valores que vieram só na notificação, sempre reconferimos aqui
    const payResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { "Authorization": `Bearer ${MP_ACCESS_TOKEN}` },
    });
    const payment = await payResp.json();

    if (payment.status !== "approved") {
      return new Response("ok", { status: 200 }); // ainda pendente/recusado — não libera nada
    }

    const [uid, tier] = String(payment.external_reference || "").split("|");
    if (!uid || !DURATION_DAYS[tier]) return new Response("ok", { status: 200 });

    const { data: existing } = await supabase.from("vip_status").select("*").eq("uid", uid).maybeSingle();
    const now = Date.now();
    // se já tinha VIP ativo, soma em cima; se não, começa a contar de agora
    const base = (existing?.active_until && existing.active_until > now) ? existing.active_until : now;
    const activeUntil = base + DURATION_DAYS[tier] * 86400 * 1000;
    const history = Array.isArray(existing?.history) ? existing.history : [];
    history.push({ tier, purchasedAt: now, paymentId, amount: payment.transaction_amount });

    await supabase.from("vip_status").upsert({
      uid, tier, active_until: activeUntil, history, updated_at: now,
    });

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("erro no webhook do mercado pago:", e);
    return new Response("erro", { status: 500 });
  }
});
