-- Rode isso no Supabase: painel → SQL Editor → New query → cola isso → Run

create table if not exists vip_status (
  uid text primary key,
  tier text,
  active_until bigint,
  history jsonb not null default '[]'::jsonb,
  "freeGrant6moUsed" boolean not null default false,
  updated_at bigint
);

alter table vip_status enable row level security;

-- qualquer jogador pode LER o status de VIP de qualquer um (precisa pra mostrar
-- a aura/personagem VRM dos outros jogadores certinho)
create policy "leitura publica vip_status"
  on vip_status for select
  using (true);

-- de propósito NÃO criamos política de INSERT/UPDATE aqui — ninguém consegue
-- escrever nessa tabela pelo navegador (nem com a chave pública). Só as Edge
-- Functions (que usam a service role key, por trás) conseguem gravar VIP de verdade.
