// Edge Function: create-vip-payment
// Recebe {uid, tier} do jogo, cria uma preferência de pagamento no Mercado Pago
// e devolve a URL de checkout pra redirecionar o jogador.
//
// Variáveis de ambiente necessárias (configurar em Project Settings → Edge Functions → Secrets):
//   MP_ACCESS_TOKEN  → o Access Token do Mercado Pago (o comprido, tipo APP_USR-...-...)
//   GAME_URL         → a URL onde o jogo fica hospedado (ex: https://seusite.com)

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;
const GAME_URL = Deno.env.get("GAME_URL") || "https://example.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

// preços definidos aqui no servidor — o jogo nunca manda o preço, só o nome do plano,
// assim ninguém consegue "editar" o preço pelo navegador
const PRICES: Record<string, number> = {
  "1week": 4.90,
  "1month": 14.90,
  "5months": 69.90,
  "1year": 146.90,
  "2years": 268.90,
};
const NAMES: Record<string, string> = {
  "1week": "VIP Nébula — 1 semana",
  "1month": "VIP Nébula — 1 mês",
  "5months": "VIP Nébula — 5 meses",
  "1year": "VIP Nébula — 1 ano",
  "2years": "VIP Nébula — 2 anos",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { uid, tier } = await req.json();
    if (!uid || !PRICES[tier]) {
      return new Response(JSON.stringify({ error: "uid ou tier inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const externalRef = `${uid}|${tier}|${Date.now()}`;

    const resp = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [{ title: NAMES[tier], quantity: 1, currency_id: "BRL", unit_price: PRICES[tier] }],
        external_reference: externalRef,
        back_urls: { success: GAME_URL, failure: GAME_URL, pending: GAME_URL },
        auto_return: "approved",
        notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook`,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      console.error("erro mercado pago:", data);
      return new Response(JSON.stringify({ error: "erro ao criar preferência", details: data }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // com credenciais de teste, o Mercado Pago devolve "sandbox_init_point";
    // com credenciais de produção, devolve "init_point" — usamos o que existir
    const checkoutUrl = data.sandbox_init_point || data.init_point;
    return new Response(JSON.stringify({ checkout_url: checkoutUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("erro create-vip-payment:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
