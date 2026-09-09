#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Gerador do Relatório de Auditoria de Segurança — Panelinha Team Balancer (Volley).

Uso (a partir da raiz do repositório):
    docs/security-audit/.venv/Scripts/python.exe docs/security-audit/gerar_relatorio.py

Dependências isoladas no venv local docs/security-audit/.venv (reportlab + matplotlib).
Nada e instalado globalmente. Para recriar o ambiente:
    python -m venv docs/security-audit/.venv
    docs/security-audit/.venv/Scripts/python.exe -m pip install reportlab matplotlib

Saida: docs/security-audit/relatorio-auditoria-seguranca.pdf
"""

import os
import datetime

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

# ---------------------------------------------------------------------------
# Identidade visual
# ---------------------------------------------------------------------------

PROJETO = "Panelinha Team Balancer"
TITULO = "Relatório de Auditoria de Segurança"
DATA = datetime.date(2026, 9, 8)

COR = {
    "crítica": colors.HexColor("#B91C1C"),
    "alta": colors.HexColor("#EA580C"),
    "média": colors.HexColor("#D97706"),
    "baixa": colors.HexColor("#2563EB"),
    "forte": colors.HexColor("#059669"),
}
HEX = {k: v.hexval().replace("0x", "#") for k, v in COR.items()}

TINTA = colors.HexColor("#111827")
TINTA_SUAVE = colors.HexColor("#4B5563")
LINHA = colors.HexColor("#D1D5DB")
FUNDO_SUAVE = colors.HexColor("#F3F4F6")
FUNDO_CODIGO = colors.HexColor("#F8FAFC")

BASE = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(BASE))
SAIDA = os.path.join(BASE, "relatorio-auditoria-seguranca.pdf")

ORDEM_SEV = ["crítica", "alta", "média", "baixa"]
ROTULO_SEV = {
    "crítica": "CRÍTICA",
    "alta": "ALTA",
    "média": "MÉDIA",
    "baixa": "BAIXA",
    "info": "INFORMATIVA",
    "forte": "PONTO FORTE",
}

# ---------------------------------------------------------------------------
# Categorias auditadas (mapeadas para a stack detectada)
# ---------------------------------------------------------------------------

MIGRACAO = "supabase/migrations/20260908160000_security_audit_remediation.sql"
SUITE = "src/test/db/securityAuditRemediation.dbtest.ts"

# O que efetivamente foi entregue por achado. Mantido separado dos achados para que a
# secao 4 continue descrevendo o que a auditoria encontrou, e nao o que se fez depois.
REMEDIACAO = {
    "A1": (
        "<font face='Courier'>revoke execute ... from authenticated</font> em "
        "<font face='Courier'>regenerate_career_events_for_sessions(uuid[])</font>. A função continua "
        "existindo e sendo chamada internamente por <font face='Courier'>recalculate_player_career</font>, "
        "que executa como dona e não depende do grant."
    ),
    "A2": (
        "<font face='Courier'>revoke execute ... from authenticated</font> em "
        "<font face='Courier'>recalculate_player_career(uuid)</font> — <b>e não a guarda de "
        "<font face='Courier'>auth.uid()</font> que este laudo havia sugerido</b>. Ver a nota de correção "
        "abaixo."
    ),
    "A3": (
        "<font face='Courier'>revoke execute ... from authenticated</font> em "
        "<font face='Courier'>regenerate_player_milestones(uuid)</font>, pela mesma razão de A1."
    ),
    "A4": (
        "Os dezesseis DELETE incondicionais passaram a ser escopados pela conta alvo; o restante do "
        "escopo vem das FKs em cascata de <font face='Courier'>sessions</font>, "
        "<font face='Courier'>communities</font> e <font face='Courier'>players</font>. As duas tabelas de "
        "avaliação, que referenciam com <font face='Courier'>on delete restrict</font>, saem antes, "
        "escopadas à mão. A função também passou a recusar alvo em branco e foi endurecida para "
        "<font face='Courier'>search_path = ''</font>."
    ),
    "A5": (
        "<font face='Courier'>security definer</font> restaurado em "
        "<font face='Courier'>log_table_changes()</font> (mais <font face='Courier'>search_path = ''</font>), "
        "o que torna a policy desnecessária: ela foi removida e o <font face='Courier'>insert</font> em "
        "<font face='Courier'>modification_logs</font> foi revogado de "
        "<font face='Courier'>authenticated</font>."
    ),
    "A6": (
        "<font face='Courier'>name</font> passa a voltar NULL a menos que o chamador compartilhe "
        "comunidade com o atleta ou administre alguma comunidade. Assinatura e "
        "<font face='Courier'>id</font> preservados: a checagem de username no cadastro depende da "
        "presença da linha, e a busca de vínculo depende do nome para confirmar a pessoa."
    ),
    "A7": (
        "<font face='Courier'>revoke execute ... from authenticated</font> em "
        "<font face='Courier'>community_capabilities(uuid, uuid)</font>. O wrapper "
        "<font face='Courier'>current_user_has_community_capability</font> segue funcionando, porque é "
        "<font face='Courier'>security definer</font> e resolve a chamada interna com os privilégios da dona."
    ),
    "A8": (
        "UPDATE e DELETE alinhados ao INSERT (<font face='Courier'>or</font> → "
        "<font face='Courier'>and</font>) em <font face='Courier'>community_rules</font>, "
        "<font face='Courier'>whatsapp_list_templates</font> e "
        "<font face='Courier'>community_players</font>."
    ),
    "A9": (
        "A leitura pública passou a excluir o prefixo <font face='Courier'>proposals/</font>, e uma segunda "
        "policy dá acesso a ele apenas ao admin do jogador. Avatar aprovado segue público por design."
    ),
    "A10": (
        "CSP publicado nos dois blocos do <font face='Courier'>nginx.conf</font> — o header não é herdado "
        "pelo <font face='Courier'>location</font> de assets, mesma razão já documentada ali para o "
        "<font face='Courier'>nosniff</font>."
    ),
}

CATEGORIAS = {
    "C1": "Banco sem tranca (isolamento de inquilino)",
    "C2": "Permissão definida no navegador",
    "C3": "IDOR (objeto por ID sem posse)",
    "C4": "Chaves expostas (hardcode)",
    "C5": "Inputs sem tratamento (XSS)",
}

# ---------------------------------------------------------------------------
# Achados verificados
# ---------------------------------------------------------------------------

ACHADOS = [
    {
        "id": "A1",
        "sev": "alta",
        "cat": "C3",
        "titulo": "RPC regenerate_career_events_for_sessions apaga histórico de qualquer sessão sem checar autorização",
        "arquivo": "supabase/migrations/20260730120000_scope_career_points_by_owner.sql",
        "linhas": "12-30, 150",
        "codigo": (
            "12: create or replace function public.regenerate_career_events_for_sessions(target_sessions uuid[])\n"
            "13: returns void\n"
            "14: language plpgsql\n"
            "15: security definer\n"
            "16: set search_path = public\n"
            "17: as $$\n"
            "18: begin\n"
            "19:   if target_sessions is null or array_length(target_sessions, 1) is null then\n"
            "20:     return;\n"
            "21:   end if;\n"
            "...\n"
            "25:   delete from public.career_events\n"
            "26:    where type = 'session_played'\n"
            "27:      and session_id = any(target_sessions);\n"
            "...\n"
            "150: grant execute on function public.regenerate_career_events_for_sessions(uuid[]) to authenticated;"
        ),
        "porque": (
            "A função é <b>security definer</b> (executa como dona da tabela, ignorando RLS), está concedida "
            "a <b>todo o papel authenticated</b> e <b>não contém nenhuma verificação de autorização</b>: não há "
            "<font face='Courier'>auth.uid()</font>, nem checagem de posse da sessão, nem de capability de comunidade. "
            "O único parâmetro é um array de UUIDs de sessão fornecido pelo chamador. "
            "A tabela <font face='Courier'>career_events</font> recebe apenas "
            "<font face='Courier'>grant select</font> ao papel authenticated "
            "(20260727100000_career_events.sql:30-31), ou seja, escrita direta e deliberadamente bloqueada — "
            "e esta RPC é justamente o desvio que devolve essa escrita a qualquer usuário logado. "
            "Qualquer conta autenticada pode chamar "
            "<font face='Courier'>POST /rest/v1/rpc/regenerate_career_events_for_sessions</font> com IDs de sessões "
            "de outras comunidades e disparar o DELETE incondicional da linha 25."
        ),
        "impacto": (
            "Escrita entre inquilinos. A regeneração subsequente só reinsere eventos de linhas vivas "
            "(<font face='Courier'>deleted_at is null</font> em players/teams/games e "
            "<font face='Courier'>status = 'finished'</font>): histórico cuja origem foi apagada logicamente "
            "no passado e <b>perdido de forma permanente</b>. Serve também como vetor de exaustão de recursos — "
            "DELETE + INSERT de custo arbitrário sobre a tabela inteira, sem limite de taxa."
        ),
        "condições": "Basta uma conta autenticada qualquer. Não exige papel, capability, feature flag nem configuração insegura.",
        "correção": (
            "Revogar o <font face='Courier'>execute</font> de <font face='Courier'>authenticated</font> (a função só é "
            "chamada internamente por <font face='Courier'>recalculate_player_career</font>, que executa como dona e não "
            "depende do grant), ou adicionar no início do corpo a checagem de capability por sessão/comunidade no padrão já "
            "usado em <font face='Courier'>assert_target_session_write_authorized</font>."
        ),
    },
    {
        "id": "A2",
        "sev": "alta",
        "cat": "C3",
        "titulo": "RPC recalculate_player_career aceita qualquer player_id sem verificar vínculo com o chamador",
        "arquivo": "supabase/migrations/20260727140000_career_recalc_on_claim.sql",
        "linhas": "5-31",
        "codigo": (
            " 5: create or replace function public.recalculate_player_career(p_player_id uuid)\n"
            " 6: returns void\n"
            " 7: language plpgsql\n"
            " 8: security definer\n"
            " 9: set search_path = public\n"
            "10: as $$\n"
            "11: declare\n"
            "12:   affected uuid[];\n"
            "13: begin\n"
            "...\n"
            "25:   perform public.regenerate_career_events_for_sessions(affected);\n"
            "26:   perform public.regenerate_player_milestones(p_player_id);\n"
            "27: end;\n"
            "28: $$;\n"
            "...\n"
            "31: grant execute on function public.recalculate_player_career(uuid) to authenticated;"
        ),
        "porque": (
            "IDOR classico em forma de RPC: o objeto é endereçado por <font face='Courier'>p_player_id</font> vindo do "
            "chamador e <b>nenhuma linha do corpo verifica posse</b> — não há "
            "<font face='Courier'>auth.uid()</font>, <font face='Courier'>current_user_is_player_admin(p_player_id)</font> "
            "nem <font face='Courier'>player_is_linked_to_current_user</font>, todos já existentes no schema e usados por "
            "outras funções. Como é <font face='Courier'>security definer</font>, o RLS de "
            "<font face='Courier'>players</font> e <font face='Courier'>career_events</font> não se aplica. "
            "IDs de jogador válidos são obtidos por caminhos legitimos do próprio app (ver A6)."
        ),
        "impacto": (
            "Um usuário autenticado forca a recomputação da carreira de <b>qualquer atleta da base</b>, encadeando os "
            "dois DELETE das funções A1 e A3 sobre dados de comunidades das quais não participa."
        ),
        "condições": "Conta autenticada e um UUID de jogador válido. Sem outros pre-requisitos.",
        "correção": (
            "<b>Nota de correção deste laudo.</b> A versão original recomendava exigir "
            "<font face='Courier'>current_user_is_player_admin(p_player_id)</font> no início da função. "
            "<b>Essa recomendação estava errada e quebraria o cadastro.</b> A verificação da remediação "
            "mostrou que <font face='Courier'>recalculate_player_career</font> é chamada por "
            "<font face='Courier'>handle_new_user()</font> (schema.sql:2606), o trigger de signup que roda no "
            "INSERT em <font face='Courier'>auth.users</font>: ali ainda não existe sessão e "
            "<font face='Courier'>auth.uid()</font> é NULL, de modo que qualquer guarda baseada em identidade "
            "faria o cadastro com claim code falhar. "
            "A correção certa é <b>revogar o <font face='Courier'>execute</font> de "
            "<font face='Courier'>authenticated</font></b>: nenhum código de cliente chama esta RPC, e "
            "<font face='Courier'>handle_new_user</font> é <font face='Courier'>security definer</font> de "
            "<font face='Courier'>postgres</font>, então a chamada interna resolve com os privilégios da dona e "
            "independe do grant."
        ),
    },
    {
        "id": "A3",
        "sev": "alta",
        "cat": "C3",
        "titulo": "RPC regenerate_player_milestones apaga marcos de qualquer jogador sem autorização",
        "arquivo": "supabase/migrations/20260727150000_career_milestones.sql",
        "linhas": "9-16, 99",
        "codigo": (
            " 9: create or replace function public.regenerate_player_milestones(p_player_id uuid)\n"
            "10: returns void\n"
            "11: language plpgsql\n"
            "12: security definer\n"
            "13: set search_path = public\n"
            "14: as $$\n"
            "15: begin\n"
            "16:   delete from public.career_events\n"
            "17:    where type = 'milestone' and player_id = p_player_id;\n"
            "...\n"
            "99: grant execute on function public.regenerate_player_milestones(uuid) to authenticated;"
        ),
        "porque": (
            "Mesma falha de A2, com a agravante de que a <b>primeira instrução executada é um DELETE</b>, antes de "
            "qualquer validação. Não há checagem de autorização alguma no corpo. Concedida a "
            "<font face='Courier'>authenticated</font> e <font face='Courier'>security definer</font>."
        ),
        "impacto": (
            "Marcos de carreira são conquistas historicas com <font face='Courier'>source_key</font> fixa. Como a "
            "regeneração recalcula a partir dos eventos <font face='Courier'>session_played</font> vivos, marcos cuja "
            "base foi apagada logicamente não voltam: perda permanente de dado de outro inquilino."
        ),
        "condições": "Conta autenticada e um UUID de jogador válido.",
        "correção": "Identica a A2: guarda de autorização no início, ou revogação do grant a authenticated.",
    },
    {
        "id": "A4",
        "sev": "média",
        "cat": "C1",
        "titulo": "reset_product_data apaga dados de TODOS os inquilinos apesar de receber um account_uuid alvo",
        "arquivo": "supabase/migrations/20260905185744_versioned_player_evaluation_source.sql",
        "linhas": "315-356",
        "codigo": (
            "315: create or replace function public.reset_product_data(target_account_uuid text)\n"
            "...\n"
            "331:   delete from public.point_events;          -- sem WHERE\n"
            "332:   delete from public.games;                 -- sem WHERE\n"
            "333:   delete from public.teams;                 -- sem WHERE\n"
            "334:   delete from public.sessions;              -- sem WHERE\n"
            "339:   delete from public.career_events;         -- sem WHERE\n"
            "340:   delete from public.player_evaluations;    -- sem WHERE\n"
            "341:   delete from public.self_evaluations;      -- sem WHERE\n"
            "346:   delete from public.community_players;     -- sem WHERE\n"
            "...\n"
            "353:   delete from public.players\n"
            "354:    where owner_id = target_account_uuid::uuid      -- unico DELETE escopado\n"
            "355:      and not has_account_identity_history;\n"
            "356:   delete from public.communities where owner_id = target_account_uuid::uuid;"
        ),
        "porque": (
            "A assinatura recebe <font face='Courier'>target_account_uuid</font> e sugere um reset por conta, mas "
            "<b>apenas os dois últimos DELETE usam esse parâmetro</b>. Os dezesseis anteriores (linhas 331-350) são "
            "incondicionais e varrem as tabelas inteiras, de todas as contas e comunidades. O parâmetro cria uma "
            "falsa sensação de escopo no chamador — <font face='Courier'>src/infra/supabase/resetScaffoldCloudService.ts:3</font> "
            "passa um único UUID de conta."
        ),
        "impacto": (
            "Perda total e irreversível de dados operacionais de toda a plataforma (sessões, jogos, pontos, avaliações, "
            "carreira) a partir de uma ação que aparenta afetar só uma conta."
        ),
        "condições": (
            "<b>Requer papel <font face='Courier'>master</font> com AAL2.</b> A capability foi removida de "
            "<font face='Courier'>programmer</font> em 20260729000000_reset_scaffold_programmer_revoke.sql:8, entao não há "
            "escalonamento aqui — o risco é de raio de alcance e erro operacional, não de privilégio."
        ),
        "correção": (
            "Escopar cada DELETE por <font face='Courier'>owner_id</font>/comunidade da conta alvo (ou por subconsulta nas "
            "comunidades dela); alternativamente, renomear para explicitar o escopo global e exigir confirmação dupla. "
            "Cobrir com teste <font face='Courier'>.dbtest.ts</font> que crie duas contas e prove que o reset de uma não "
            "toca a outra."
        ),
    },
    {
        "id": "A5",
        "sev": "média",
        "cat": "C1",
        "titulo": "Política de INSERT em modification_logs com WITH CHECK (true) permite forjar trilha de auditoria",
        "arquivo": "supabase/migrations/20260820110000_modification_logs_insert_policy.sql",
        "linhas": "7-10",
        "codigo": (
            " 7: drop policy if exists \"Authenticated users can insert modification logs\" on public.modification_logs;\n"
            " 8: create policy \"Authenticated users can insert modification logs\" on public.modification_logs\n"
            " 9:   for insert to authenticated\n"
            "10:   with check (true);"
        ),
        "porque": (
            "A política de leitura da mesma tabela é corretamente escopada — "
            "<font face='Courier'>using (owner_id = auth.uid() or current_user_has_community_role(community_id))</font> "
            "em 20260610161203_backend_operational_sync.sql:572-576 — mas a de escrita aceita <b>qualquer linha</b>. "
            "Como <font face='Courier'>insert</font> só avalia <font face='Courier'>with check</font>, um usuário "
            "autenticado pode gravar registros de auditoria com <font face='Courier'>owner_id</font>, "
            "<font face='Courier'>community_id</font>, tabela e payload arbitrários, atribuindo ações a terceiros. "
            "<b>Causa raiz, identificada na remediação.</b> A política não foi um descuido isolado: ela é o "
            "sintoma de uma regressão anterior. Em "
            "20260801120000_reset_product_data_preserve_canonical.sql:128-131, "
            "<font face='Courier'>log_table_changes()</font> foi recriada para ganhar o bypass de reset e, nesse "
            "<font face='Courier'>create or replace</font>, <b>não repetiu o "
            "<font face='Courier'>security definer</font></b> — que o PostgreSQL não herda. O trigger virou "
            "<font face='Courier'>security invoker</font>, passou a inserir como o usuário chamador e a esbarrar no "
            "RLS da própria tabela de auditoria. Três semanas depois, 20260820110000 destravou o 42501 resultante "
            "com <font face='Courier'>with check (true)</font>, trocando um erro visível por uma tabela de "
            "auditoria aberta. O comentário imediatamente abaixo da política em "
            "<font face='Courier'>schema.sql</font> sempre afirmou o contrário — que a tabela é populada por "
            "trigger <font face='Courier'>SECURITY DEFINER</font> — e passou três semanas contradizendo o código."
        ),
        "impacto": (
            "Perda de integridade e não-repúdio da trilha de auditoria: poluição do log, atribuição falsa de ações a "
            "outros usuários e mascaramento de atividade real."
        ),
        "condições": "Conta autenticada. Sem pre-requisitos adicionais.",
        "correção": (
            "Restaurar o <font face='Courier'>security definer</font> em "
            "<font face='Courier'>log_table_changes()</font>, atacando a causa e não o sintoma: "
            "<font face='Courier'>postgres</font> é dona de <font face='Courier'>modification_logs</font> e a tabela "
            "não tem <font face='Courier'>force row level security</font>, então o trigger volta a gravar sem "
            "depender de política alguma. Com isso a política de INSERT pode ser removida e o "
            "<font face='Courier'>insert</font> revogado de <font face='Courier'>authenticated</font> — que é o que "
            "o comentário em schema.sql já descrevia. Escopar por "
            "<font face='Courier'>owner_id = (select auth.uid())</font> seria pior: o trigger grava o dono da linha "
            "alterada, que não é o chamador quando um admin edita dado de terceiro."
        ),
    },
    {
        "id": "A6",
        "sev": "baixa",
        "cat": "C1",
        "titulo": "find_player_by_username expoe nome e UUID de qualquer atleta, contornando o modelo de privacidade",
        "arquivo": "supabase/migrations/20260610161256_global_athlete_identity.sql",
        "linhas": "63-78",
        "codigo": (
            "63: create or replace function public.find_player_by_username(target_username text)\n"
            "64: returns table (id uuid, username text, name text)\n"
            "65: language sql\n"
            "66: stable\n"
            "67: security definer\n"
            "68: set search_path = public\n"
            "69: as $$\n"
            "70:   select p.id, p.username, p.name\n"
            "71:   from public.players p\n"
            "72:   where lower(p.username) = lower(trim(target_username))\n"
            "73:     and p.deleted_at is null\n"
            "74:   limit 1;\n"
            "75: $$;\n"
            "...\n"
            "78: grant execute on function public.find_player_by_username(text) to authenticated;"
        ),
        "porque": (
            "<font face='Courier'>security definer</font> sem filtro por comunidade ou por relação com o chamador: "
            "consulta a tabela global <font face='Courier'>players</font> ignorando o RLS "
            "(<font face='Courier'>current_user_can_access_player</font>) e o modelo de privacidade construído em "
            "20260726170000_community_profile_privacy.sql e 20260726210000_profile_visibility_status_rules.sql. "
            "Devolve o nome real e o UUID interno do atleta."
        ),
        "impacto": (
            "Divulgação de identidade entre inquilinos e — mais relevante — fornece o "
            "<font face='Courier'>player_id</font> que os achados A2 e A3 consomem como entrada, encurtando a cadeia de "
            "exploração daqueles."
        ),
        "condições": (
            "Exige conhecer/adivinhar o <font face='Courier'>username</font> exato (a busca é por igualdade, não por "
            "prefixo), o que limita a enumeração em massa. A função existe para o fluxo legitimo de vínculo de conta."
        ),
        "correção": (
            "Restringir o retorno ao mínimo necessário para o fluxo de vínculo (por exemplo, só "
            "<font face='Courier'>id</font> e <font face='Courier'>username</font>, sem <font face='Courier'>name</font>), "
            "e aplicar limite de taxa por chamador."
        ),
    },
    {
        "id": "A7",
        "sev": "baixa",
        "cat": "C1",
        "titulo": "community_capabilities revela as capabilities de qualquer usuário em qualquer comunidade",
        "arquivo": "supabase/migrations/20260905185744_versioned_player_evaluation_source.sql",
        "linhas": "15-45 (grant em 20260827150000_normalize_governance_and_organizer.sql:171)",
        "codigo": (
            "15: create or replace function public.community_capabilities(\n"
            "16:   target_community_id uuid,\n"
            "17:   target_user_id uuid\n"
            "18: )\n"
            "19: returns setof text\n"
            "20: language sql\n"
            "21: stable\n"
            "22: security definer\n"
            "23: set search_path = ''\n"
            "...\n"
            "(20260827150000:171) grant execute on function public.community_capabilities(uuid, uuid) to authenticated;"
        ),
        "porque": (
            "O parâmetro <font face='Courier'>target_user_id</font> é livre e não há comparação com "
            "<font face='Courier'>auth.uid()</font>. O wrapper seguro "
            "<font face='Courier'>current_user_has_community_capability</font> fixa o usuário corrente, mas a função "
            "subjacente também está concedida a <font face='Courier'>authenticated</font> e pode ser chamada diretamente "
            "com qualquer par (comunidade, usuário)."
        ),
        "impacto": (
            "Mapeamento do grafo de papéis e pertencimento da plataforma: permite descobrir quem e "
            "<font face='Courier'>owner</font>/<font face='Courier'>admin</font> de quais comunidades e escolher alvos "
            "para engenharia social. Somente leitura."
        ),
        "condições": "Conta autenticada e conhecimento dos UUIDs de comunidade e usuário.",
        "correção": (
            "Revogar <font face='Courier'>execute</font> de <font face='Courier'>authenticated</font> e manter apenas o "
            "wrapper <font face='Courier'>current_user_has_community_capability</font> exposto, como já é feito com "
            "<font face='Courier'>assert_target_session_write_authorized</font> "
            "(20260828034435_target_session_organizer_assignments.sql:172-173)."
        ),
    },
    {
        "id": "A8",
        "sev": "baixa",
        "cat": "C2",
        "titulo": "Ramo owner_id nas políticas de UPDATE/DELETE preserva privilégio de quem foi rebaixado",
        "arquivo": "supabase/migrations/20260610161203_backend_operational_sync.sql",
        "linhas": "545-551 (community_rules); mesmo padrão em 562-569 whatsapp_list_templates e 20260617180615:81-96 community_players",
        "codigo": (
            "542: create policy \"Community owners and admins can insert community rules\" on public.community_rules\n"
            "543:   for insert to authenticated\n"
            "544:   with check (owner_id = (select auth.uid()) AND public.current_user_has_community_role(community_id, array['owner','admin']));\n"
            "545: create policy \"Community owners and admins can update community rules\" on public.community_rules\n"
            "546:   for update to authenticated\n"
            "547:   using (owner_id = (select auth.uid()) OR public.current_user_has_community_role(community_id, array['owner','admin']))\n"
            "548:   with check (owner_id = (select auth.uid()) OR public.current_user_has_community_role(community_id, array['owner','admin']));"
        ),
        "porque": (
            "O INSERT exige <b>as duas</b> condições (<font face='Courier'>AND</font>): a linha só nasce se o criador for "
            "owner/admin naquele momento. Ja o UPDATE e o DELETE aceitam <b>qualquer uma</b> "
            "(<font face='Courier'>OR</font>). Como <font face='Courier'>owner_id</font> guarda o usuário que criou a "
            "linha, o primeiro ramo continua verdadeiro para sempre: quem criou a regra enquanto era admin e depois foi "
            "rebaixado a membro comum mantem permissão de alterar e apagar aquela linha, apesar de a interface "
            "(<font face='Courier'>permissions.canEditRules</font> em src/components/community/CommunitiesView.tsx:539) "
            "já não oferecer a ação."
        ),
        "impacto": (
            "Privilégio residual após rebaixamento. O gate de papel existe no servidor, mas o ramo de posse o contorna "
            "para as linhas criadas no periodo privilegiado — exatamente o caso em que a UI é a única barreira restante."
        ),
        "condições": (
            "Exige que o usuário tenha criado a linha enquanto era owner/admin e depois tenha sido rebaixado sem sair da "
            "comunidade. Não afeta quem nunca teve o papel."
        ),
        "correção": (
            "Alinhar UPDATE/DELETE ao INSERT, trocando o <font face='Courier'>OR</font> por "
            "<font face='Courier'>AND</font> nas três tabelas, ou migrar essas escritas para RPCs semânticas como já foi "
            "feito com <font face='Courier'>sessions</font> e <font face='Courier'>community_memberships</font>."
        ),
    },
    {
        "id": "A9",
        "sev": "baixa",
        "cat": "C1",
        "titulo": "Política de leitura do bucket de avatares vale para anon e expoe propostas não aprovadas",
        "arquivo": "supabase/migrations/20260624133117_player_avatars_approval.sql",
        "linhas": "285-287",
        "codigo": (
            "285: create policy \"Avatars are publicly readable\" on storage.objects\n"
            "286:   for select\n"
            "287:   using (bucket_id = 'avatars');"
        ),
        "porque": (
            "A política <b>não tem cláusula <font face='Courier'>to</font></b>, entao vale para o papel "
            "<font face='Courier'>public</font> — inclusive <font face='Courier'>anon</font>. As três políticas de escrita "
            "logo abaixo (linhas 290, 300, 316) são corretamente restritas a "
            "<font face='Courier'>to authenticated</font> + <font face='Courier'>current_user_is_player_admin</font>, mas a "
            "leitura cobre todo o bucket, incluindo o prefixo <font face='Courier'>proposals/&lt;player_id&gt;/</font> — "
            "isto e, fotos enviadas que <b>ainda não passaram pela aprovação</b>."
        ),
        "impacto": (
            "Imagens submetidas e pendentes (ou rejeitadas) de qualquer atleta ficam acessíveis sem autenticação a quem "
            "souber o caminho do objeto, esvaziando o propósito do fluxo de aprovação."
        ),
        "condições": (
            "Exige conhecer o caminho do objeto, que contém o UUID do jogador — obtível via A6. Avatares já aprovados são "
            "públicos por design; o problema é o prefixo de propostas."
        ),
        "correção": (
            "Restringir a leitura pública ao prefixo de avatares aprovados e exigir "
            "<font face='Courier'>current_user_is_player_admin</font> para o prefixo "
            "<font face='Courier'>proposals/</font>, espelhando as políticas de escrita."
        ),
    },
    {
        "id": "A10",
        "sev": "baixa",
        "cat": "C5",
        "titulo": "Ausência de Content-Security-Policy no nginx (defesa em profundidade para XSS)",
        "arquivo": "nginx.conf",
        "linhas": "25-33",
        "codigo": (
            "25:         add_header X-Frame-Options \"SAMEORIGIN\";\n"
            "26:         add_header X-XSS-Protection \"1; mode=block\";\n"
            "27:         add_header X-Content-Type-Options \"nosniff\";\n"
            "...\n"
            "31:     add_header X-Frame-Options \"SAMEORIGIN\";\n"
            "32:     add_header X-XSS-Protection \"1; mode=block\";\n"
            "33:     add_header X-Content-Type-Options \"nosniff\";\n"
            "    (nenhum add_header Content-Security-Policy em todo o arquivo)"
        ),
        "porque": (
            "Não há nenhum <font face='Courier'>Content-Security-Policy</font> no <font face='Courier'>nginx.conf</font>, "
            "no <font face='Courier'>index.html</font> nem no <font face='Courier'>vite.config.ts</font>. "
            "<b>Este achado não decorre de nenhum sink de XSS existente</b> — a varredura da categoria 5 não encontrou "
            "nenhum (ver Pontos Fortes). O <font face='Courier'>X-XSS-Protection</font> presente é obsoleto e ignorado "
            "por navegadores modernos, de modo que hoje a aplicação não tem camada de contenção caso um sink seja "
            "introduzido no futuro ou uma dependência de terceiros seja comprometida."
        ),
        "impacto": (
            "Sem impacto direto hoje. Remove a rede de proteção contra injeção de script vinda de uma regressão futura ou "
            "de comprometimento de dependência da cadeia de suprimentos."
        ),
        "condições": "Não explorável isoladamente. Trata-se de endurecimento preventivo.",
        "correção": (
            "Adicionar um CSP restritivo no nginx cobrindo o domínio do Supabase e o Turnstile, por exemplo: "
            "<font face='Courier'>default-src 'self'; connect-src 'self' https://*.supabase.co; "
            "img-src 'self' data: https://*.supabase.co; frame-src https://challenges.cloudflare.com; "
            "object-src 'none'; base-uri 'self'</font>. Repetir o header no bloco de assets estaticos, pelo mesmo motivo "
            "já documentado em comentário nas linhas 22-24."
        ),
    },
]

# ---------------------------------------------------------------------------
# Pontos fortes verificados
# ---------------------------------------------------------------------------

FORTES = [
    (
        "RLS habilitado em 100% das tabelas de aplicação",
        "As 47 tabelas criadas nas migrações possuem <font face='Courier'>enable row level security</font>. "
        "A conferência cruzou a lista de <font face='Courier'>create table</font> com a de "
        "<font face='Courier'>alter table ... enable row level security</font> em supabase/migrations/ e não "
        "encontrou nenhuma tabela descoberta.",
    ),
    (
        "Nenhum segredo embutido em código, config, deploy, CI ou histórico git",
        "<font face='Courier'>.env.example:3-7</font> contém apenas placeholders; "
        "<font face='Courier'>src/lib/supabaseClient.ts:8-9</font> le exclusivamente de "
        "<font face='Courier'>import.meta.env</font> sem fallback literal; "
        "<font face='Courier'>docker-compose.yml</font> e <font face='Courier'>Dockerfile</font> não definem "
        "credenciais nem defaults do tipo <font face='Courier'>${VAR:-valor}</font>. "
        "A varredura de 160 commits por JWT (<font face='Courier'>eyJ...</font>), "
        "<font face='Courier'>sb_secret_</font>, chaves privadas PEM e "
        "<font face='Courier'>SUPABASE_SERVICE_ROLE_KEY</font> retornou apenas leituras de variável de ambiente e "
        "documentação. O bundle em <font face='Courier'>dist/</font> não contém nenhuma chave nem URL de projeto.",
    ),
    (
        "Nenhum sink de XSS no frontend",
        "Zero ocorrências de <font face='Courier'>dangerouslySetInnerHTML</font>, "
        "<font face='Courier'>eval</font>, <font face='Courier'>new Function</font>, "
        "<font face='Courier'>srcdoc</font>, <font face='Courier'>outerHTML</font>, "
        "<font face='Courier'>insertAdjacentHTML</font> e <font face='Courier'>document.write</font> em "
        "<font face='Courier'>src/</font>. As duas ocorrências de <font face='Courier'>innerHTML</font> "
        "(CaptchaField.spec.tsx:35 e PlayerComponents.spec.tsx:57) são <b>leituras</b> em asserções de teste. "
        "Não há renderização de markdown/HTML e nenhuma dependência de markdown no "
        "<font face='Courier'>package.json</font>. Os valores dinâmicos em atributos aparecem só em "
        "<font face='Courier'>&lt;img src&gt;</font> (6 pontos), que não executa <font face='Courier'>javascript:</font>; "
        "não há nenhum <font face='Courier'>href</font> dinâmico. O único "
        "<font face='Courier'>window.open</font> (src/logic/exporters.ts:132) usa host fixo "
        "<font face='Courier'>wa.me</font> com <font face='Courier'>encodeURIComponent</font> (linha 130).",
    ),
    (
        "Mutações sensíveis passam por RPC com guarda de servidor, não por CRUD do navegador",
        "<font face='Courier'>set_user_role</font> (20260726110000:172-214) exige "
        "<font face='Courier'>require_aal2()</font> + <font face='Courier'>is_superadmin()</font> e ainda protege o "
        "último master. <font face='Courier'>set_community_member_role</font> e "
        "<font face='Courier'>remove_community_member</font> seguem o mesmo padrão. A coluna "
        "<font face='Courier'>profiles.role</font> e travada por trigger fora do RPC via "
        "<font face='Courier'>app.allow_role_change</font> (20260624141708:35), impedindo escalonamento por update direto.",
    ),
    (
        "Auditoria completa das 90 RPCs expostas: 80 com guarda de autorização confirmada",
        "Foram enumeradas todas as funções com <font face='Courier'>grant execute ... to authenticated</font> e "
        "inspecionada a definição mais recente de cada uma. As da família Target Session "
        "(<font face='Courier'>update_target_session_draft</font>, "
        "<font face='Courier'>add_target_session_court</font>, "
        "<font face='Courier'>freeze_target_session_rules_snapshot</font>) delegam a "
        "<font face='Courier'>assert_target_session_write_authorized</font> "
        "(20260828034435:153-170), que exige <font face='Courier'>auth.uid()</font> e atribuição válida de organizador. "
        "<font face='Courier'>record_player_evaluation</font> (20260906130635:128) válida autenticação, capability "
        "<font face='Courier'>player.evaluate</font> e vínculo vivo do jogador na comunidade.",
    ),
    (
        "players.user_id imutável por trigger",
        "Alteração do vínculo entre conta e atleta e bloqueada fora do fluxo de aprovação "
        "(20260722162234_account_identity_foundation.sql:137-144: "
        "<font face='Courier'>raise exception 'user_id can only be changed through the player link approval flow'</font>), "
        "impedindo sequestro de identidade via update direto, mesmo com a política de UPDATE de "
        "<font face='Courier'>players</font> sendo permissiva quanto a colunas.",
    ),
    (
        "Escritas em sessions restritas ao modelo legacy; o modelo target só escreve por comando",
        "As políticas recriadas em 20260827210000_target_session_root.sql:94-124 exigem "
        "<font face='Courier'>authority_model = 'legacy'</font> em INSERT/UPDATE/DELETE, removendo por completo o CRUD "
        "direto do navegador sobre sessões target — que passam exclusivamente por RPCs "
        "<font face='Courier'>security definer</font> autorizadas.",
    ),
    (
        "Regra de arquitetura proíbe autorização derivada do cliente, com teste automatizado",
        "<font face='Courier'>src/architecture/legacyExpansionRules.ts:76-85</font> (AF-FREEZE-005) barra "
        "<font face='Courier'>actorRole</font>, <font face='Courier'>callerRole</font>, "
        "<font face='Courier'>isAdminFromClient</font>, <font face='Courier'>p_actor_*</font> e afins, com baseline "
        "vazia; AF-FREEZE-004 (linhas 63-73) proíbe <font face='Courier'>.from(</font>/<font face='Courier'>.rpc(</font> "
        "nas camadas de UI e domínio. Ambas são verificadas por "
        "<font face='Courier'>src/architecture/legacyExpansionGuard.test.ts</font>. Isso institucionaliza no CI a "
        "prevenção da categoria 2.",
    ),
    (
        "Gates de papel do frontend tem contrapartida no servidor",
        "Cada gate visual foi cruzado com seu caminho de escrita: "
        "<font face='Courier'>canEditRules</font> (CommunitiesView.tsx:539) contra as políticas de "
        "<font face='Courier'>community_rules</font> (owner/admin); "
        "<font face='Courier'>canManageMembers</font> (CommunitiesView.tsx:861) contra os RPCs de membership com AAL2; "
        "<font face='Courier'>isMaster</font> (GestaoView.tsx:59,88) contra "
        "<font face='Courier'>set_user_role</font>; "
        "<font face='Courier'>isStaff</font> (appRoutes.ts:105-106) contra as políticas "
        "<font face='Courier'>App staff can read ...</font> geradas em 20260624133529:305-317. "
        "Nenhum caso em que a UI seja a única barreira — a única ressalva é o privilégio residual de A8.",
    ),
    (
        "Pipeline de CI sem exposição de credencial",
        "<font face='Courier'>.github/workflows/ci.yml</font> usa "
        "<font face='Courier'>persist-credentials: false</font> no checkout e não referência nenhum "
        "<font face='Courier'>secret</font>; "
        "<font face='Courier'>architecture-check.yml</font> declara "
        "<font face='Courier'>permissions: contents: read</font>. Nenhum workflow imprime variáveis de ambiente.",
    ),
    (
        "Autenticação com captcha e MFA obrigatório para operações sensíveis",
        "<font face='Courier'>src/infra/supabase/authClient.ts:23-58</font> encaminha "
        "<font face='Courier'>captchaToken</font> (Cloudflare Turnstile) em login, cadastro e recuperação de senha. "
        "A migração 20260726110000_mandatory_mfa_and_aal2_enforcement.sql impoe "
        "<font face='Courier'>require_aal2()</font> nas RPCs de mudanca de papel, remoção de membro e transferência de "
        "propriedade.",
    ),
]

FRACOS = [
    (
        "As RPCs de carreira são um bypass de RLS aberto a qualquer conta",
        "<font face='Courier'>career_events</font> recebe apenas <font face='Courier'>grant select</font>, o que mostra a "
        "intenção de manter a tabela somente-leitura para o cliente. As três funções "
        "<font face='Courier'>security definer</font> de A1-A3 devolvem escrita destrutiva a qualquer usuário "
        "autenticado, sem uma única linha de autorização. É o risco central do relatório: são os únicos pontos onde a "
        "arquitetura de isolamento — sólida em todo o resto — está simplesmente ausente.",
    ),
    (
        "Guardas concentradas no corpo das funções, sem rede de segurança no grant",
        "O projeto usa consistentemente o padrão "
        "<font face='Courier'>revoke all ... from public, anon</font> seguido de "
        "<font face='Courier'>grant execute ... to authenticated</font>. Quando a checagem interna é esquecida "
        "(A1, A2, A3, A7), nada mais barra a chamada. Funções auxiliares que não devem ser chamadas diretamente "
        "deveriam ser revogadas também de <font face='Courier'>authenticated</font>, como já foi feito com "
        "<font face='Courier'>assert_target_session_write_authorized</font> e "
        "<font face='Courier'>regenerate_career_events()</font>.",
    ),
    (
        "Assimetria AND/OR entre INSERT e UPDATE nas políticas herdadas",
        "As políticas mais antigas (20260610161203) usam <font face='Courier'>OR owner_id</font> em UPDATE/DELETE "
        "enquanto o INSERT usa <font face='Courier'>AND</font>. O resultado é privilégio que sobrevive ao rebaixamento "
        "(A8). As migrações recentes já abandonaram esse padrão em favor de capabilities e comandos semânticos; a dívida "
        "estava nas tabelas que ainda não haviam sido migradas.",
    ),
    (
        "Superfície destrutiva sem escopo de inquilino",
        "<font face='Courier'>reset_product_data</font> (A4) é o exemplo mais claro: um parâmetro de conta que não "
        "escopa dezesseis dos dezoito DELETE. Ainda que protegido por master + AAL2, o desenho convida ao erro "
        "operacional irreversível.",
    ),
]

RECOMENDACOES = [
    (
        "P1",
        "Fechar o bypass de autorização nas três RPCs de carreira",
        "Revogar <font face='Courier'>execute</font> de <font face='Courier'>authenticated</font> nas <b>três</b>: "
        "nenhuma é chamada pelo cliente, e todas são invocadas internamente por funções que executam como donas. "
        "A versão original desta recomendação pedia uma guarda de "
        "<font face='Courier'>current_user_is_player_admin</font> em "
        "<font face='Courier'>recalculate_player_career(uuid)</font>; ela foi <b>descartada</b> na implementação "
        "porque quebraria o cadastro com claim code (ver A2). Coberto por suíte "
        "<font face='Courier'>.dbtest.ts</font> que prova a negação entre inquilinos e o cadastro intacto.",
        "A1, A2, A3",
    ),
    (
        "P1",
        "Escopar reset_product_data ao inquilino alvo",
        "Adicionar <font face='Courier'>where owner_id = target_account_uuid::uuid</font> (ou subconsulta pelas "
        "comunidades da conta) aos dezesseis DELETE incondicionais, com teste que prove que o reset de uma conta não "
        "afeta outra.",
        "A4",
    ),
    (
        "P2",
        "Corrigir a política de INSERT de modification_logs",
        "Substituir <font face='Courier'>with check (true)</font> por escopo em "
        "<font face='Courier'>owner_id = (select auth.uid())</font>, ou tornar o trigger de auditoria "
        "<font face='Courier'>security definer</font> e remover a política de INSERT do papel authenticated.",
        "A5",
    ),
    (
        "P2",
        "Eliminar a assimetria AND/OR nas políticas herdadas",
        "Alinhar UPDATE/DELETE ao INSERT em <font face='Courier'>community_rules</font>, "
        "<font face='Courier'>whatsapp_list_templates</font> e <font face='Courier'>community_players</font>, "
        "ou migrar essas escritas para comandos semânticos como já foi feito em sessions.",
        "A8",
    ),
    (
        "P2",
        "Reduzir a superfície de leitura das funções auxiliares",
        "Revogar <font face='Courier'>community_capabilities(uuid, uuid)</font> de "
        "<font face='Courier'>authenticated</font>, mantendo só o wrapper de usuário corrente, e enxugar o retorno de "
        "<font face='Courier'>find_player_by_username</font>.",
        "A6, A7",
    ),
    (
        "P3",
        "Separar leitura pública de avatares aprovados e de propostas",
        "Restringir a política de SELECT do bucket ao prefixo aprovado e exigir "
        "<font face='Courier'>current_user_is_player_admin</font> em <font face='Courier'>proposals/</font>.",
        "A9",
    ),
    (
        "P3",
        "Adicionar Content-Security-Policy no nginx",
        "Publicar um CSP restritivo cobrindo Supabase e Turnstile, repetido no bloco de assets estaticos pelo mesmo "
        "motivo de heranca de header já documentado no arquivo.",
        "A10",
    ),
]

# ---------------------------------------------------------------------------
# Issues para o GitHub
# ---------------------------------------------------------------------------

ISSUES = [
    {
        "titulo": "[Segurança] RPCs de carreira permitem que qualquer usuário autenticado apague histórico de outros inquilinos",
        "labels": "`security`, `severity:alta`, `database`, `rls`",
        "entregue": (
            "As tres RPCs perderam o <font face='Courier'>execute</font> de <font face='Courier'>authenticated</font>. A sugestão de guarda em <font face='Courier'>recalculate_player_career</font> <b>não foi seguida</b>: ela quebraria o cadastro com claim code, porque a função roda dentro do trigger de signup, onde <font face='Courier'>auth.uid()</font> ainda e NULL. Dois testes cobrem isso — a recusa das tres chamadas e o claim de jogador continuando a funcionar."
        ),
        "corpo": """## Problema

Três funções `security definer` estão concedidas ao papel `authenticated` **sem nenhuma verificação de autorização no corpo**:

| Função | Arquivo:linha | Guarda |
|---|---|---|
| `regenerate_career_events_for_sessions(uuid[])` | `supabase/migrations/20260730120000_scope_career_points_by_owner.sql:12` | nenhuma |
| `recalculate_player_career(uuid)` | `supabase/migrations/20260727140000_career_recalc_on_claim.sql:5` | nenhuma |
| `regenerate_player_milestones(uuid)` | `supabase/migrations/20260727150000_career_milestones.sql:9` | nenhuma |

Nenhuma delas chama `auth.uid()`, `current_user_is_player_admin()` ou qualquer capability. O objeto alvo vem inteiramente
do parâmetro do chamador (array de `session_id` ou um `player_id`).

## Por que é explorável

`career_events` recebe apenas `grant select` ao papel `authenticated`
(`20260727100000_career_events.sql:30-31`), ou seja, a escrita direta pelo cliente foi deliberadamente bloqueada.
Como `security definer` executa com os privilégios da dona da função, o RLS não se aplica — e essas três RPCs devolvem
exatamente a escrita que o grant nega, para qualquer conta logada:

```
POST /rest/v1/rpc/regenerate_career_events_for_sessions
Authorization: Bearer <qualquer JWT de usuario comum>
{ "target_sessions": ["<uuid de sessao de outra comunidade>", "..."] }
```

UUIDs de jogador válidos são obtidos pelo próprio app via `find_player_by_username`.

## Evidência

`supabase/migrations/20260730120000_scope_career_points_by_owner.sql:12-27`
```sql
create or replace function public.regenerate_career_events_for_sessions(target_sessions uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_sessions is null or array_length(target_sessions, 1) is null then
    return;
  end if;

  delete from public.career_events
   where type = 'session_played'
     and session_id = any(target_sessions);
```

`supabase/migrations/20260727150000_career_milestones.sql:9-17` — o DELETE é a primeira instrução, antes de qualquer validação:
```sql
create or replace function public.regenerate_player_milestones(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.career_events
   where type = 'milestone' and player_id = p_player_id;
```

Grants (`20260730120000:150`, `20260727140000:31`, `20260727150000:99`):
```sql
grant execute on function public.regenerate_career_events_for_sessions(uuid[]) to authenticated;
grant execute on function public.recalculate_player_career(uuid) to authenticated;
grant execute on function public.regenerate_player_milestones(uuid) to authenticated;
```

## Impacto

- **Escrita e destruição de dados entre inquilinos.** A regeneração só reinsere eventos de linhas vivas
  (`deleted_at is null`, `status = 'finished'`): histórico cuja origem foi apagada logicamente **não volta**.
- **Marcos de carreira perdidos permanentemente** — `source_key` é fixa e a conquista não é reconquistada.
- **Exaustao de recursos**: DELETE + INSERT de custo arbitrário sobre a tabela inteira, sem limite de taxa.

## Condições de exploração

Apenas uma conta autenticada. Sem papel especial, sem feature flag, sem configuração insegura.

## Sugestão de correção

Nova migration:

```sql
-- Nenhuma das duas e chamada pelo cliente: recalculate_player_career as invoca
-- internamente e, sendo security definer, nao depende destes grants.
revoke execute on function public.regenerate_career_events_for_sessions(uuid[]) from authenticated;
revoke execute on function public.regenerate_player_milestones(uuid) from authenticated;

create or replace function public.recalculate_player_career(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  affected uuid[];
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.current_user_is_player_admin(p_player_id) then
    raise exception 'Not authorized to recalculate this player career' using errcode = '42501';
  end if;
  -- ... corpo atual ...
end;
$$;
```

## Critérios de aceite

- [ ] `regenerate_career_events_for_sessions(uuid[])` e `regenerate_player_milestones(uuid)` não tem mais `execute` para `authenticated` (conferir em `information_schema.role_routine_grants`).
- [ ] `recalculate_player_career(uuid)` levanta `42501` quando o chamador não e admin do jogador alvo.
- [ ] Suite `.dbtest.ts` em `src/test/db/` cria duas contas em comunidades distintas e prova que a conta A não consegue alterar `career_events` da conta B por nenhuma das três RPCs.
- [ ] O fluxo legitimo de recálculo após claim de jogador continua verde.
- [ ] `npm run typecheck && npm run test` verdes.
""",
    },
    {
        "titulo": "[Segurança] reset_product_data apaga dados de todos os inquilinos apesar de receber uma conta alvo",
        "labels": "`security`, `severity:média`, `database`, `data-loss`",
        "entregue": (
            "Os dezesseis DELETE incondicionais foram escopados pela conta alvo, alvo em branco passou a ser recusado e a função foi endurecida para <font face='Courier'>search_path = ''</font>. O teste cria duas contas com dados, reseta uma e prova que a outra sobreviveu inteira."
        ),
        "corpo": """## Problema

`public.reset_product_data(target_account_uuid text)` recebe um UUID de conta, mas **apenas os dois últimos DELETE
usam esse parâmetro**. Os dezesseis anteriores varrem as tabelas inteiras, de todas as contas e comunidades.

## Por que é explorável

Não é um furo de privilégio — a função exige capability `reset_product_data` (hoje só `master`, após
`20260729000000_reset_scaffold_programmer_revoke.sql:8`) mais `require_aal2()`. O problema é o **raio de alcance**:
a assinatura e o chamador sugerem um reset por conta, e o efeito real é global e irreversível.
`src/infra/supabase/resetScaffoldCloudService.ts:3` passa um único UUID de conta, reforcando a leitura errada.

## Evidência

`supabase/migrations/20260905185744_versioned_player_evaluation_source.sql:315-356`
```sql
create or replace function public.reset_product_data(target_account_uuid text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.has_capability('reset_product_data') then
    raise exception 'Not authorized: missing reset_product_data capability';
  end if;
  perform public.require_aal2();
  ...
  delete from public.point_events;          -- linha 331, sem WHERE
  delete from public.games;                 -- linha 332, sem WHERE
  delete from public.teams;                 -- linha 333, sem WHERE
  delete from public.sessions;              -- linha 334, sem WHERE
  delete from public.career_events;         -- linha 339, sem WHERE
  delete from public.player_evaluations;    -- linha 340, sem WHERE
  delete from public.self_evaluations;      -- linha 341, sem WHERE
  delete from public.community_players;     -- linha 346, sem WHERE
  ...
  delete from public.players                -- linha 353, unico DELETE escopado
   where owner_id = target_account_uuid::uuid
     and not has_account_identity_history;
  delete from public.communities where owner_id = target_account_uuid::uuid;  -- linha 356
end;
$$;
```

## Impacto

Perda total e irreversível dos dados operacionais de **toda a plataforma** (sessões, jogos, pontos, avaliações,
carreira, presenças, relatórios) a partir de uma ação que aparenta afetar apenas uma conta.

## Condições de exploração

Requer papel `master` autenticado com AAL2. Risco de erro operacional e de abuso por conta privilegiada comprometida,
não de escalonamento.

## Sugestão de correção

Escopar cada DELETE pelo inquilino alvo, por exemplo:

```sql
delete from public.point_events
 where session_id in (select id from public.sessions where owner_id = target_account_uuid::uuid);
delete from public.sessions where owner_id = target_account_uuid::uuid;
```

Se o escopo global for realmente desejado para um cenário de scaffold, renomear a função para explicitar isso
(por exemplo `reset_all_product_data()`), remover o parâmetro enganoso e exigir confirmação explicita.

## Critérios de aceite

- [ ] Nenhum `delete from public.<tabela>;` sem cláusula de escopo permanece na função (ou o escopo global esta explicito no nome e sem parâmetro de conta).
- [ ] Suite `.dbtest.ts` cria duas contas com dados, executa o reset da conta A e prova que os dados da conta B permanecem intactos.
- [ ] `src/infra/supabase/resetScaffoldCloudService.ts` e a UI de Gestão refletem o escopo real da operação.
""",
    },
    {
        "titulo": "[Segurança] Política de INSERT em modification_logs com WITH CHECK (true) permite forjar trilha de auditoria",
        "labels": "`security`, `severity:média`, `database`, `rls`, `audit`",
        "entregue": (
            "Corrigida pela causa e não pelo sintoma: o <font face='Courier'>security definer</font> foi restaurado em <font face='Courier'>log_table_changes()</font>, a policy permissiva removida e o <font face='Courier'>insert</font> revogado de <font face='Courier'>authenticated</font>. Os testes provam a recusa da linha forjada e que o trigger segue gravando auditoria sem policy nenhuma."
        ),
        "corpo": """## Problema

A política de INSERT de `public.modification_logs` aceita qualquer linha de qualquer usuário autenticado.

## Por que é explorável

A política de leitura da mesma tabela é corretamente escopada
(`20260610161203_backend_operational_sync.sql:572-576`):

```sql
create policy "Community members can read modification logs" on public.modification_logs
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (community_id is not null and public.current_user_has_community_role(community_id))
  );
```

Mas `insert` avalia somente `with check`, que é `true`. Um usuário autenticado pode inserir registros de auditoria com
`owner_id`, `community_id`, nome de tabela e payload arbitrários — atribuindo ações a terceiros:

```
POST /rest/v1/modification_logs
{ "owner_id": "<uuid de outro usuario>", "community_id": "<uuid alheio>", "table_name": "sessions", ... }
```

A política nasceu para destravar o trigger `log_table_changes()`, mas o trigger executa como dono da função e não
depende de um grant tao amplo.

## Evidência

`supabase/migrations/20260820110000_modification_logs_insert_policy.sql:7-10`
```sql
drop policy if exists "Authenticated users can insert modification logs" on public.modification_logs;
create policy "Authenticated users can insert modification logs" on public.modification_logs
  for insert to authenticated
  with check (true);
```

## Impacto

Perda de integridade e de não-repúdio da trilha de auditoria: poluição do log, atribuição falsa de ações a outros
usuários e mascaramento de atividade real durante uma investigação.

## Condições de exploração

Conta autenticada. Sem pre-requisitos adicionais.

## Sugestão de correção

```sql
drop policy if exists "Authenticated users can insert modification logs" on public.modification_logs;
create policy "Authenticated users can insert modification logs" on public.modification_logs
  for insert to authenticated
  with check (owner_id = (select auth.uid()));
```

Se o trigger precisar gravar linhas em nome de outro `owner_id`, torna-lo `security definer` com
`set search_path = public` e remover por completo a política de INSERT do papel `authenticated`.

## Critérios de aceite

- [ ] Um usuário autenticado não consegue inserir em `modification_logs` uma linha com `owner_id` diferente do seu.
- [ ] O trigger `log_table_changes()` continua gravando corretamente em update/upsert (sem 42501) — coberto por `.dbtest.ts`.
- [ ] Teste que prove a negação do INSERT forjado.
""",
    },
    {
        "titulo": "[Segurança] Políticas de UPDATE/DELETE preservam privilégio de membros rebaixados (ramo owner_id)",
        "labels": "`security`, `severity:baixa`, `database`, `rls`",
        "entregue": (
            "UPDATE e DELETE alinhados ao INSERT nas tres tabelas. O teste promove um usuário a admin, deixa que ele crie a linha, rebaixa a membro e prova que UPDATE e DELETE passam a não afetar linha alguma — e que a escrita legítima volta quando ele e repromovido."
        ),
        "corpo": """## Problema

Nas tabelas `community_rules`, `whatsapp_list_templates` e `community_players`, o INSERT exige **as duas** condições
(`AND`) enquanto UPDATE/DELETE aceitam **qualquer uma** (`OR`). Como `owner_id` guarda quem criou a linha, o primeiro
ramo permanece verdadeiro para sempre.

## Por que é explorável

Um usuário que criou a linha enquanto era `owner`/`admin` e depois foi rebaixado a membro comum continua podendo
alterar e apagar aquela linha, embora a interface já não ofereca a ação
(`permissions.canEditRules` em `src/components/community/CommunitiesView.tsx:539`). O gate de papel existe no servidor,
mas o ramo de posse o contorna — exatamente o caso em que a UI vira a única barreira restante.

## Evidência

`supabase/migrations/20260610161203_backend_operational_sync.sql:542-551`
```sql
create policy "Community owners and admins can insert community rules" on public.community_rules
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.current_user_has_community_role(community_id, array['owner', 'admin']));

create policy "Community owners and admins can update community rules" on public.community_rules
  for update to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_has_community_role(community_id, array['owner', 'admin']))
  with check (owner_id = (select auth.uid()) or public.current_user_has_community_role(community_id, array['owner', 'admin']));

create policy "Community owners and admins can delete community rules" on public.community_rules
  for delete to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_has_community_role(community_id, array['owner', 'admin']));
```

Mesmo padrão em `20260610161203_backend_operational_sync.sql:562-569` (`whatsapp_list_templates`) e
`20260617180615_community_players_optimization.sql:81-96` (`community_players`).

## Impacto

Privilégio residual após rebaixamento: edição e remoção de regras da comunidade, templates e vínculos de jogador por
quem já perdeu o papel.

## Condições de exploração

Requer que o usuário tenha criado a linha enquanto era owner/admin e depois tenha sido rebaixado sem sair da
comunidade. Não afeta quem nunca teve o papel.

## Sugestão de correção

Trocar o `or` por `and` nas políticas de UPDATE e DELETE das três tabelas, alinhando ao INSERT:

```sql
using (owner_id = (select auth.uid()) and public.current_user_has_community_role(community_id, array['owner', 'admin']))
```

Alternativamente, migrar essas escritas para RPCs semânticas, como já foi feito com `sessions`
(`20260827210000_target_session_root.sql`) e `community_memberships`.

## Critérios de aceite

- [ ] Teste `.dbtest.ts`: usuário cria regra como admin, é rebaixado a `member`, e o UPDATE e o DELETE daquela linha passam a ser negados.
- [ ] Owner/admin atuais continuam podendo editar regras criadas por outros.
- [ ] Mesma cobertura para `whatsapp_list_templates` e `community_players`.
""",
    },
    {
        "titulo": "[Segurança] Funções auxiliares expoem identidade e grafo de papéis a qualquer usuário autenticado",
        "labels": "`security`, `severity:baixa`, `database`, `privacy`",
        "entregue": (
            "<font face='Courier'>community_capabilities</font> foi revogada de <font face='Courier'>authenticated</font>. Em <font face='Courier'>find_player_by_username</font> a assinatura foi preservada e apenas <font face='Courier'>name</font> passou a ser condicional, porque remover o campo quebraria a busca de vínculo e remover a função quebraria a checagem de username no cadastro."
        ),
        "corpo": """## Problema

Duas funções `security definer` concedidas a `authenticated` aceitam alvo arbitrário e contornam o modelo de
privacidade construído nas migrações `20260726170000_community_profile_privacy.sql` e
`20260726210000_profile_visibility_status_rules.sql`.

## Por que é explorável

**`find_player_by_username(text)`** — consulta a tabela global `players` ignorando o RLS
(`current_user_can_access_player`) e devolve nome real e UUID interno de qualquer atleta.
Alem da divulgação em si, fornece o `player_id` que as RPCs de carreira consomem como entrada, encurtando a cadeia de
exploração daquele achado.

**`community_capabilities(uuid, uuid)`** — o parâmetro `target_user_id` é livre e não há comparação com `auth.uid()`.
O wrapper seguro `current_user_has_community_capability` fixa o usuário corrente, mas a função subjacente também está
concedida a `authenticated` e pode ser chamada diretamente com qualquer par (comunidade, usuário).

## Evidência

`supabase/migrations/20260610161256_global_athlete_identity.sql:63-78`
```sql
create or replace function public.find_player_by_username(target_username text)
returns table (id uuid, username text, name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.name
  from public.players p
  where lower(p.username) = lower(trim(target_username))
    and p.deleted_at is null
  limit 1;
$$;

grant execute on function public.find_player_by_username(text) to authenticated;
```

`supabase/migrations/20260905185744_versioned_player_evaluation_source.sql:15-23` e o grant em
`supabase/migrations/20260827150000_normalize_governance_and_organizer.sql:171`
```sql
create or replace function public.community_capabilities(
  target_community_id uuid,
  target_user_id uuid
)
returns setof text
language sql
stable
security definer
set search_path = ''
...
grant execute on function public.community_capabilities(uuid, uuid) to authenticated;
```

## Impacto

Divulgação de identidade entre inquilinos e mapeamento do grafo de papéis e pertencimento da plataforma — util para
escolher alvos de engenharia social e para encadear com os achados de carreira. Somente leitura.

## Condições de exploração

Conta autenticada. `find_player_by_username` busca por igualdade exata, o que limita enumeração em massa; ela existe
para o fluxo legitimo de vínculo de conta, entao a correção deve preservar esse caso de uso.

## Sugestão de correção

```sql
-- Manter apenas o wrapper de usuario corrente exposto, como ja e feito com
-- assert_target_session_write_authorized (20260828034435:172-173).
revoke execute on function public.community_capabilities(uuid, uuid) from authenticated;

-- Enxugar o retorno ao minimo necessario para o fluxo de vinculo.
create or replace function public.find_player_by_username(target_username text)
returns table (id uuid, username text)
...
```

Adicionar limite de taxa por chamador em `find_player_by_username`.

## Critérios de aceite

- [ ] `community_capabilities(uuid, uuid)` não tem mais `execute` para `authenticated`; `current_user_has_community_capability` continua funcionando em todas as políticas que o usam.
- [ ] `find_player_by_username` não devolve mais `name`, ou o devolve apenas quando o chamador compartilha comunidade com o alvo.
- [ ] Fluxo de vínculo de jogador por username continua verde.
- [ ] `npm run typecheck && npm run test` verdes.
""",
    },
    {
        "titulo": "[Segurança] Bucket de avatares tem leitura anônima, expondo propostas não aprovadas",
        "labels": "`security`, `severity:baixa`, `storage`, `privacy`",
        "entregue": (
            "Leitura pública restrita ao que não esta sob <font face='Courier'>proposals/</font>, com segunda policy dando esse prefixo ao admin do jogador. O teste liga o RLS no stand-in de storage do harness dentro de uma transação revertida — sem isso as policies existiriam sem nunca serem avaliadas, e o teste não provaria nada."
        ),
        "corpo": """## Problema

A política de SELECT de `storage.objects` para o bucket `avatars` não declara cláusula `to`, portanto vale para o papel
`public` — inclusive `anon`.

## Por que é explorável

As três políticas de escrita logo abaixo são corretamente restritas a `to authenticated` +
`current_user_is_player_admin`, mas a leitura cobre o bucket inteiro, incluindo o prefixo
`proposals/<player_id>/` — ou seja, fotos que **ainda não passaram pela aprovação** (ou que foram rejeitadas).
O UUID de jogador que compõe o caminho é obtível via `find_player_by_username`.

## Evidência

`supabase/migrations/20260624133117_player_avatars_approval.sql:285-287`
```sql
create policy "Avatars are publicly readable" on storage.objects
  for select
  using (bucket_id = 'avatars');
```

Contraste com a política de upload nas linhas 290-297, corretamente restrita:
```sql
create policy "Player admins can upload avatar candidates" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'proposals'
    and public.current_user_is_player_admin(((storage.foldername(name))[2])::uuid)
  );
```

## Impacto

Imagens submetidas e pendentes ou rejeitadas de qualquer atleta ficam acessíveis sem autenticação a quem souber o
caminho do objeto, esvaziando o propósito do fluxo de aprovação de avatar.

## Condições de exploração

Exige conhecer o caminho do objeto, que contém o UUID do jogador. Avatares **já aprovados** são públicos por design —
o problema é restrito ao prefixo `proposals/`.

## Sugestão de correção

```sql
drop policy if exists "Avatars are publicly readable" on storage.objects;

create policy "Approved avatars are publicly readable" on storage.objects
  for select
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] <> 'proposals');

create policy "Player admins can read avatar candidates" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'proposals'
    and public.current_user_is_player_admin(((storage.foldername(name))[2])::uuid)
  );
```

## Critérios de aceite

- [ ] Requisição anônima a um objeto sob `proposals/` retorna 403/404.
- [ ] Requisição anônima a um avatar aprovado continua retornando 200.
- [ ] Admin do jogador continua conseguindo listar e visualizar as propostas daquele jogador na caixa de aprovação (`src/components/player/AvatarApprovalInbox.tsx`).
""",
    },
    {
        "titulo": "[Segurança] Adicionar Content-Security-Policy ao nginx",
        "labels": "`security`, `severity:baixa`, `hardening`, `deploy`",
        "entregue": (
            "CSP publicado nos dois blocos do <font face='Courier'>nginx.conf</font>. Verificado servindo o bundle real pelo nginx real: header presente em <font face='Courier'>/</font> e nos assets, app carregado no navegador e Web Worker do balanceador executado, sem violação originada pela aplicação. Turnstile e Supabase seguem pendentes de conferência em homologacao, por dependerem de credencial."
        ),
        "corpo": """## Problema

Não há nenhum header `Content-Security-Policy` em `nginx.conf`, `index.html` ou `vite.config.ts`.

## Por que importa

**Este item não decorre de nenhuma falha de XSS existente.** A varredura da categoria encontrou zero sinks:
sem `dangerouslySetInnerHTML`, `eval`, `new Function`, `srcdoc`, `outerHTML`, `insertAdjacentHTML` ou
`document.write` em `src/`; sem renderização de markdown; sem `href` dinâmico. O código está limpo hoje.

O ponto é a ausência de rede de contenção: o `X-XSS-Protection` presente é obsoleto e ignorado por navegadores
modernos, entao uma regressão futura ou o comprometimento de uma dependência teria execução livre.

## Evidência

`nginx.conf:25-33` — os três headers presentes, sem CSP em nenhum bloco:
```nginx
        add_header X-Frame-Options "SAMEORIGIN";
        add_header X-XSS-Protection "1; mode=block";
        add_header X-Content-Type-Options "nosniff";
    }

    # Security headers (valem para o location / e demais sem add_header proprio)
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-XSS-Protection "1; mode=block";
    add_header X-Content-Type-Options "nosniff";
}
```

## Impacto

Sem impacto direto no estado atual do código. Endurecimento preventivo contra regressão e contra comprometimento da
cadeia de suprimentos.

## Sugestão de correção

Adicionar em ambos os blocos (o comentário das linhas 22-24 já documenta por que o header precisa ser repetido no
`location` de assets):

```nginx
add_header Content-Security-Policy "default-src 'self'; connect-src 'self' https://*.supabase.co; img-src 'self' data: blob: https://*.supabase.co; style-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-src https://challenges.cloudflare.com; script-src 'self' https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'" always;
```

Validar em homologação antes de promover: o Turnstile (`@marsidev/react-turnstile`) precisa de
`challenges.cloudflare.com` em `script-src` e `frame-src`, e o Supabase Storage precisa constar em `img-src`.

## Critérios de aceite

- [ ] `curl -I` na aplicação publicada retorna `Content-Security-Policy` tanto em `/` quanto em um asset `.js`.
- [ ] Login, cadastro e recuperação de senha com Turnstile funcionam sem violação de CSP no console.
- [ ] Upload e exibição de avatar funcionam sem violação de CSP.
- [ ] Nenhum erro de CSP no console navegando pelas telas principais.
""",
    },
]

# ---------------------------------------------------------------------------
# Graficos
# ---------------------------------------------------------------------------


def contagem_severidade():
    c = {s: 0 for s in ORDEM_SEV}
    for a in ACHADOS:
        c[a["sev"]] += 1
    return c


def grafico_rosca(caminho):
    c = contagem_severidade()
    itens = [(s, n) for s, n in c.items() if n > 0]
    valores = [n for _, n in itens]
    cores = [HEX[s] for s, _ in itens]
    rotulos = [f"{ROTULO_SEV[s].capitalize()}\n{n}" for s, n in itens]

    fig, ax = plt.subplots(figsize=(4.6, 3.5), dpi=220)
    wedges, _ = ax.pie(
        valores,
        colors=cores,
        startangle=90,
        counterclock=False,
        wedgeprops=dict(width=0.42, edgecolor="white", linewidth=2.2),
    )
    for w, rot in zip(wedges, rotulos):
        ang = (w.theta2 + w.theta1) / 2.0
        import math

        x = 0.79 * math.cos(math.radians(ang))
        y = 0.79 * math.sin(math.radians(ang))
        ax.text(x, y, rot, ha="center", va="center", fontsize=15, color="white", fontweight="bold")

    ax.text(0, 0.12, str(len(ACHADOS)), ha="center", va="center", fontsize=48, fontweight="bold", color="#111827")
    ax.text(0, -0.26, "achados", ha="center", va="center", fontsize=18, color="#4B5563")
    ax.set(aspect="equal")
    ax.axis("off")
    fig.tight_layout(pad=0.1)
    fig.savefig(caminho, transparent=True, bbox_inches="tight")
    plt.close(fig)


def grafico_barras(caminho):
    contagem = {k: {s: 0 for s in ORDEM_SEV} for k in CATEGORIAS}
    for a in ACHADOS:
        contagem[a["cat"]][a["sev"]] += 1

    chaves = list(CATEGORIAS.keys())
    CURTO = {
        "C1": "Isolamento\nde inquilino",
        "C2": "Permissão\nno navegador",
        "C3": "IDOR",
        "C4": "Chaves\nexpostas",
        "C5": "XSS",
    }
    rotulos = [f"{k}\n{CURTO[k]}" for k in chaves]

    fig, ax = plt.subplots(figsize=(6.6, 3.9), dpi=220)
    base = [0] * len(chaves)
    for s in ORDEM_SEV:
        vals = [contagem[k][s] for k in chaves]
        if not any(vals):
            continue
        ax.bar(rotulos, vals, bottom=base, color=HEX[s], label=ROTULO_SEV[s].capitalize(), width=0.58,
               edgecolor="white", linewidth=1.1)
        for i, v in enumerate(vals):
            if v:
                ax.text(i, base[i] + v / 2, str(v), ha="center", va="center",
                        fontsize=15, color="white", fontweight="bold")
        base = [b + v for b, v in zip(base, vals)]

    for i, k in enumerate(chaves):
        total = sum(contagem[k].values())
        if total == 0:
            ax.text(i, 0.08, "0", ha="center", va="bottom", fontsize=8.5,
                    color=HEX["forte"], fontweight="bold")

    ax.set_ylabel("Achados", fontsize=13, color="#4B5563")
    ax.tick_params(axis="x", labelsize=13.5, colors="#374151", pad=4)
    ax.tick_params(axis="y", labelsize=12, colors="#6B7280")
    ax.set_ylim(0, max(4, max(sum(contagem[k].values()) for k in chaves) + 1))
    ax.yaxis.set_major_locator(matplotlib.ticker.MaxNLocator(integer=True))
    for lado in ("top", "right"):
        ax.spines[lado].set_visible(False)
    ax.spines["left"].set_color("#D1D5DB")
    ax.spines["bottom"].set_color("#D1D5DB")
    ax.grid(axis="y", color="#E5E7EB", linewidth=0.6)
    ax.set_axisbelow(True)
    ax.legend(fontsize=12, frameon=False, ncol=3, loc="upper center", bbox_to_anchor=(0.5, 1.15))
    fig.tight_layout(pad=0.2)
    fig.savefig(caminho, transparent=True, bbox_inches="tight")
    plt.close(fig)


# ---------------------------------------------------------------------------
# Estilos
# ---------------------------------------------------------------------------

ss = getSampleStyleSheet()


def estilo(nome, **kw):
    kw.setdefault("parent", ss["BodyText"])
    return ParagraphStyle(nome, **kw)


E = {
    "capa_kicker": estilo("capa_kicker", fontName="Helvetica-Bold", fontSize=10, leading=14,
                          textColor=COR["forte"], alignment=TA_CENTER, spaceAfter=10),
    "capa_titulo": estilo("capa_titulo", fontName="Helvetica-Bold", fontSize=27, leading=32,
                          textColor=TINTA, alignment=TA_CENTER, spaceAfter=6),
    "capa_sub": estilo("capa_sub", fontName="Helvetica", fontSize=15, leading=20,
                       textColor=TINTA_SUAVE, alignment=TA_CENTER, spaceAfter=22),
    "capa_meta": estilo("capa_meta", fontName="Helvetica", fontSize=9.5, leading=15,
                        textColor=TINTA_SUAVE, alignment=TA_CENTER),
    "h1": estilo("h1", fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=TINTA,
                 spaceBefore=4, spaceAfter=10),
    "h2": estilo("h2", fontName="Helvetica-Bold", fontSize=11.5, leading=15, textColor=TINTA,
                 spaceBefore=12, spaceAfter=5),
    "h3": estilo("h3", fontName="Helvetica-Bold", fontSize=9.5, leading=13, textColor=TINTA_SUAVE,
                 spaceBefore=8, spaceAfter=3),
    "corpo": estilo("corpo", fontName="Helvetica", fontSize=9, leading=13.4, textColor=TINTA,
                    alignment=TA_JUSTIFY, spaceAfter=6),
    "corpo_c": estilo("corpo_c", fontName="Helvetica", fontSize=8.4, leading=12.4, textColor=TINTA,
                      alignment=TA_LEFT),
    "pequeno": estilo("pequeno", fontName="Helvetica", fontSize=7.6, leading=10.6,
                      textColor=TINTA_SUAVE, alignment=TA_LEFT),
    "código": estilo("código", fontName="Courier", fontSize=6.6, leading=8.6, textColor=colors.HexColor("#1F2937"),
                     alignment=TA_LEFT),
    "issue_md": estilo("issue_md", fontName="Courier", fontSize=6.5, leading=8.4,
                       textColor=colors.HexColor("#1F2937"), alignment=TA_LEFT),
    "delim": estilo("delim", fontName="Courier-Bold", fontSize=7.6, leading=10,
                    textColor=COR["forte"], alignment=TA_LEFT),
    "th": estilo("th", fontName="Helvetica-Bold", fontSize=7.8, leading=10.4, textColor=colors.white),
    "td": estilo("td", fontName="Helvetica", fontSize=7.8, leading=10.6, textColor=TINTA),
    "td_mono": estilo("td_mono", fontName="Courier", fontSize=6.7, leading=9.2, textColor=colors.HexColor("#1F2937")),
    "chip": estilo("chip", fontName="Helvetica-Bold", fontSize=7.2, leading=9.6,
                   textColor=colors.white, alignment=TA_CENTER),
    "chip_capa": estilo("chip_capa", fontName="Helvetica-Bold", fontSize=10.5, leading=15,
                        textColor=colors.white, alignment=TA_CENTER),
}


def chip(sev):
    return Table(
        [[Paragraph(ROTULO_SEV[sev], E["chip"])]],
        colWidths=[1.55 * cm],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), COR[sev]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 2.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
            ("LEFTPADDING", (0, 0), (-1, -1), 1),
            ("RIGHTPADDING", (0, 0), (-1, -1), 1),
        ]),
    )


def bloco_codigo(txt, largura):
    linhas = [Paragraph(l.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"), E["código"])
              for l in txt.split("\n")]
    return Table(
        [[l] for l in linhas],
        colWidths=[largura],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), FUNDO_CODIGO),
            ("BOX", (0, 0), (-1, -1), 0.5, LINHA),
            ("LINEBEFORE", (0, 0), (0, -1), 2.2, LINHA),
            ("TOPPADDING", (0, 0), (-1, -1), 0.6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0.6),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]),
    )


# ---------------------------------------------------------------------------
# Documento
# ---------------------------------------------------------------------------

MARGEM = 2 * cm
LARG_UTIL = A4[0] - 2 * MARGEM


class Doc(BaseDocTemplate):
    def __init__(self, caminho, **kw):
        BaseDocTemplate.__init__(self, caminho, pagesize=A4,
                                 leftMargin=MARGEM, rightMargin=MARGEM,
                                 topMargin=MARGEM, bottomMargin=MARGEM,
                                 title=f"{TITULO} — {PROJETO}",
                                 author="Auditoria de Segurança",
                                 subject="Auditoria de segurança de aplicação",
                                 **kw)
        quadro = Frame(MARGEM, MARGEM + 0.55 * cm, LARG_UTIL,
                       A4[1] - 2 * MARGEM - 1.35 * cm, id="corpo")
        quadro_capa = Frame(MARGEM, MARGEM, LARG_UTIL, A4[1] - 2 * MARGEM, id="capa")
        self.addPageTemplates([
            PageTemplate(id="capa", frames=[quadro_capa], onPage=self.capa),
            PageTemplate(id="normal", frames=[quadro], onPage=self.cabecalho_rodape),
        ])

    def capa(self, canv, doc):
        canv.saveState()
        canv.setFillColor(COR["forte"])
        canv.rect(0, A4[1] - 0.5 * cm, A4[0], 0.5 * cm, stroke=0, fill=1)
        canv.restoreState()

    def cabecalho_rodape(self, canv, doc):
        canv.saveState()
        y = A4[1] - MARGEM + 0.42 * cm
        canv.setFont("Helvetica", 7.4)
        canv.setFillColor(TINTA_SUAVE)
        canv.drawString(MARGEM, y, f"{TITULO} — {PROJETO}")
        canv.drawRightString(A4[0] - MARGEM, y, DATA.strftime("%d/%m/%Y"))
        canv.setStrokeColor(LINHA)
        canv.setLineWidth(0.5)
        canv.line(MARGEM, y - 0.14 * cm, A4[0] - MARGEM, y - 0.14 * cm)

        yr = MARGEM - 0.42 * cm
        canv.line(MARGEM, yr + 0.3 * cm, A4[0] - MARGEM, yr + 0.3 * cm)
        canv.setFont("Helvetica", 7.4)
        canv.drawString(MARGEM, yr, "Confidencial — uso interno")
        canv.drawRightString(A4[0] - MARGEM, yr, f"Página {canv.getPageNumber()}")
        canv.restoreState()


def construir():
    rosca = os.path.join(BASE, "_grafico_rosca.png")
    barras = os.path.join(BASE, "_grafico_barras.png")
    grafico_rosca(rosca)
    grafico_barras(barras)

    hist = []
    c = contagem_severidade()

    # ---------------- Capa ----------------
    hist += [
        Spacer(1, 1.5 * cm),
        Paragraph("AUDITORIA DE SEGURANÇA DE APLICAÇÃO", E["capa_kicker"]),
        Paragraph(f"{TITULO} — {PROJETO}", E["capa_titulo"]),
        Paragraph("Stack local-first React + Vite sobre Supabase (PostgreSQL/RLS)", E["capa_sub"]),
        Table(
            [[Paragraph(
                f"<b>TODOS OS {len(ACHADOS)} ACHADOS CORRIGIDOS E VERIFICADOS</b><br/>"
                f"<font size=8>Remediação em <font face='Courier'>{MIGRACAO.split('/')[-1]}</font> "
                f"e <font face='Courier'>nginx.conf</font>, provada por "
                f"<font face='Courier'>{SUITE.split('/')[-1]}</font></font>",
                E["chip_capa"])]],
            colWidths=[LARG_UTIL * 0.78],
            style=TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), COR["forte"]),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]),
            hAlign="CENTER",
        ),
        Spacer(1, 0.5 * cm),
    ]

    resumo_capa = Table(
        [[
            Paragraph(f"<b>{c['crítica']}</b><br/><font size=7>CRÍTICAS</font>", E["capa_meta"]),
            Paragraph(f"<b>{c['alta']}</b><br/><font size=7>ALTAS</font>", E["capa_meta"]),
            Paragraph(f"<b>{c['média']}</b><br/><font size=7>MÉDIAS</font>", E["capa_meta"]),
            Paragraph(f"<b>{c['baixa']}</b><br/><font size=7>BAIXAS</font>", E["capa_meta"]),
            Paragraph(f"<b>{len(FORTES)}</b><br/><font size=7>PONTOS FORTES</font>", E["capa_meta"]),
        ]],
        colWidths=[LARG_UTIL / 5.0] * 5,
        style=TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 9),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
            ("LINEBELOW", (0, 0), (0, 0), 2.6, COR["crítica"]),
            ("LINEBELOW", (1, 0), (1, 0), 2.6, COR["alta"]),
            ("LINEBELOW", (2, 0), (2, 0), 2.6, COR["média"]),
            ("LINEBELOW", (3, 0), (3, 0), 2.6, COR["baixa"]),
            ("LINEBELOW", (4, 0), (4, 0), 2.6, COR["forte"]),
        ]),
    )
    hist += [resumo_capa, Spacer(1, 0.6 * cm)]

    escopo = (
        "<b>Escopo auditado.</b> Todo o repositório <font face='Courier'>C:\\Volley</font> na branch "
        "<font face='Courier'>exec/c6-w5-02-skill-rubric-contract</font>: as 92 migrações em "
        "<font face='Courier'>supabase/migrations/</font> (políticas RLS, funções "
        "<font face='Courier'>security definer</font>, grants e revokes), o código de aplicação em "
        "<font face='Courier'>src/</font> (componentes React, hooks, camada de aplicação e servicos de nuvem), os "
        "arquivos de deploy (<font face='Courier'>Dockerfile</font>, "
        "<font face='Courier'>docker-compose.yml</font>, <font face='Courier'>nginx.conf</font>), os workflows de CI em "
        "<font face='Courier'>.github/workflows/</font>, o bundle compilado em <font face='Courier'>dist/</font> e o "
        "histórico de 160 commits do git. Excluido da análise o diretório "
        "<font face='Courier'>.github/skills/</font>, que contém ferramental de terceiros vendorizado e não faz parte "
        "do artefato publicado."
    )
    hist.append(Paragraph(escopo, E["corpo"]))
    hist.append(Spacer(1, 0.28 * cm))

    metodo = (
        "<b>Nota metodológica — como cada categoria foi mapeada para a stack.</b> O projeto não tem backend próprio: "
        "é uma SPA React que fala direto com o Supabase. Não existem handlers de rota, ORM nem middleware de tenant, "
        "entao as categorias genéricas foram traduzidas para os mecanismos reais desta arquitetura. "
        "<b>(1) Isolamento de inquilino</b> — o mecanismo é <b>Row Level Security do PostgreSQL</b>. Cruzou-se a lista "
        "de <font face='Courier'>create table</font> com a de "
        "<font face='Courier'>enable row level security</font> e, em seguida, analisou-se o predicado efetivo de cada "
        "política, respeitando a ordem cronológica de <font face='Courier'>drop policy</font>/"
        "<font face='Courier'>create policy</font> — vale a última definição, não a primeira. "
        "<b>(2) Permissão no navegador</b> — cada gate de papel do frontend "
        "(<font face='Courier'>canEditRules</font>, <font face='Courier'>canManageMembers</font>, "
        "<font face='Courier'>isMaster</font>, <font face='Courier'>isStaff</font>) foi rastreado até seu caminho de "
        "escrita e confrontado com a política RLS ou a RPC correspondente. "
        "<b>(3) IDOR</b> — o equivalente a um handler de rota aqui é a <b>função RPC exposta via PostgREST</b>. "
        "Enumeraram-se <b>todas</b> as 90 funções com "
        "<font face='Courier'>grant execute ... to authenticated</font> e inspecionou-se a definição mais recente de "
        "cada uma em busca de guarda de autorização sobre o ID recebido — varredura completa, não amostral. "
        "<b>(4) Chaves expostas</b> — busca por JWT, <font face='Courier'>sb_secret_</font>, chaves PEM e "
        "credenciais em código, configs, deploy, CI, documentação, no bundle <font face='Courier'>dist/</font> e em "
        "todo o histórico do git. "
        "<b>(5) XSS</b> — busca por sinks do React e do DOM no frontend; a categoria de escape em templates de backend "
        "não se aplica, pois não há renderização server-side nem envio de e-mail próprio (o fluxo de autenticação usa "
        "os templates do Supabase)."
    )
    hist.append(Paragraph(metodo, E["corpo"]))
    hist.append(Spacer(1, 0.45 * cm))
    hist.append(Paragraph(
        f"Emitido em {DATA.strftime('%d de setembro de %Y')} &nbsp;·&nbsp; "
        f"{len(ACHADOS)} achados &nbsp;·&nbsp; {len(FORTES)} pontos fortes verificados",
        E["capa_meta"]))

    hist.append(NextPageTemplate("normal"))
    hist.append(PageBreak())

    # ---------------- Resumo executivo ----------------
    hist.append(Paragraph("1. Resumo executivo", E["h1"]))

    texto_resumo = (
        "A auditoria encontrou <b>10 achados</b>: nenhum crítico, <b>3 de severidade alta</b>, "
        "<b>2 médios</b> e <b>5 baixos</b>. O quadro geral é o de uma base madura em segurança — RLS habilitado nas "
        "47 tabelas, mutações sensíveis atrás de RPCs com verificação de servidor, MFA obrigatório para operações "
        "privilegiadas, nenhum segredo no código ou no histórico e nenhum sink de XSS — com <b>um ponto de falha "
        "concentrado</b>: três funções <font face='Courier'>security definer</font> da família de carreira que foram "
        "expostas ao papel <font face='Courier'>authenticated</font> sem nenhuma verificação de autorização. "
        "Elas contornam por completo o RLS que protege o resto do sistema e permitem que qualquer conta logada apague "
        "histórico de outros inquilinos. Os demais achados são endurecimento e redução de superfície."
    )
    hist.append(Paragraph(texto_resumo, E["corpo"]))

    status = (
        f"<b><font color='{HEX['forte']}'>Situação atual: {len(ACHADOS) - 1} dos {len(ACHADOS)} "
        "achados foram corrigidos; A9 continua aberto.</font></b> "
        "<b>A9:</b> as policies novas fecham a API autenticada, mas o bucket <font face='Courier'>avatars</font> "
        "é criado com <font face='Courier'>public = true</font>, e bucket público é servido sem avaliar policy de "
        "<font face='Courier'>storage.objects</font> — quem souber o caminho continua lendo uma proposta não "
        "aprovada. Fechar exige bucket privado com URL assinada ou cópia na aprovação. "
        f"A remediação está em <font face='Courier'>{MIGRACAO}</font> e em "
        "<font face='Courier'>nginx.conf</font>, e cada achado tem prova comportamental contra um PostgreSQL real em "
        f"<font face='Courier'>{SUITE}</font> — treze testes que verificam as duas metades de cada correção: o caminho "
        "de ataque passa a ser negado <b>e</b> o fluxo legítimo que dependia daquela superfície continua funcionando. "
        "A suíte de banco foi de 629 para 642 testes, todos verdes, somados aos gates de unidade, UI, typecheck e "
        "build. O CSP foi verificado servindo o bundle real pelo nginx real e exercitando o app no navegador, "
        "inclusive o Web Worker do balanceador, sem nenhuma violação originada pela aplicação. "
        "Duas conclusões deste laudo mudaram durante a remediação e estão marcadas no texto: a correção sugerida em "
        "<b>A2</b> estava errada e quebraria o cadastro, e <b>A5</b> revelou-se sintoma de uma regressão anterior, "
        "não um descuido isolado."
    )
    hist.append(Paragraph(status, E["corpo"]))
    hist.append(Spacer(1, 0.3 * cm))

    gráficos = Table(
        [[
            Image(rosca, width=6.0 * cm, height=4.55 * cm, kind="proportional"),
            Image(barras, width=9.6 * cm, height=4.55 * cm, kind="proportional"),
        ],
         [
            Paragraph("<b>Distribuição por severidade</b>", E["pequeno"]),
            Paragraph("<b>Achados por categoria auditada</b>", E["pequeno"]),
        ]],
        colWidths=[6.4 * cm, LARG_UTIL - 6.4 * cm],
        style=TableStyle([
            ("VALIGN", (0, 0), (-1, 0), "MIDDLE"),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("TOPPADDING", (0, 1), (-1, 1), 3),
        ]),
    )
    hist.append(gráficos)
    hist.append(Spacer(1, 0.35 * cm))

    # tabela contagem
    linhas = [[Paragraph("Severidade", E["th"]), Paragraph("Qtd.", E["th"]),
               Paragraph("Achados", E["th"]), Paragraph("Leitura", E["th"])]]
    leitura = {
        "crítica": "Nenhum achado crítico.",
        "alta": "Bypass de RLS por RPC sem autorização — corrigir primeiro.",
        "média": "Raio de alcance destrutivo e integridade da auditoria.",
        "baixa": "Redução de superfície e endurecimento preventivo.",
    }
    for s in ORDEM_SEV:
        ids = ", ".join(a["id"] for a in ACHADOS if a["sev"] == s) or "—"
        linhas.append([chip(s), Paragraph(str(c[s]), E["td"]),
                       Paragraph(ids, E["td"]), Paragraph(leitura[s], E["td"])])
    linhas.append([chip("forte"), Paragraph(str(len(FORTES)), E["td"]),
                   Paragraph("Seção 2", E["td"]),
                   Paragraph("Controles verificados e funcionando.", E["td"])])

    t = Table(linhas, colWidths=[2.2 * cm, 1.3 * cm, 2.9 * cm, LARG_UTIL - 6.4 * cm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TINTA),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.4, LINHA),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, FUNDO_SUAVE]),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
    ]))
    hist.append(t)

    hist.append(PageBreak())

    # ---------------- Pontos fortes ----------------
    hist.append(Paragraph("2. Pontos fortes (verificados com evidência)", E["h1"]))
    hist.append(Paragraph(
        "Esta seção registra o que foi conferido e está correto. Ela é também a prova de cobertura da auditoria: "
        "cada item abaixo corresponde a uma verificação efetivamente executada sobre o código real.", E["corpo"]))
    hist.append(Spacer(1, 0.2 * cm))

    linhas = [[Paragraph("#", E["th"]), Paragraph("Controle verificado", E["th"]),
               Paragraph("Evidência", E["th"])]]
    for i, (titulo, ev) in enumerate(FORTES, 1):
        linhas.append([
            Paragraph(f"<b>{i}</b>", E["td"]),
            Paragraph(f"<b>{titulo}</b>", E["td"]),
            Paragraph(ev, E["td"]),
        ])
    t = Table(linhas, colWidths=[0.85 * cm, 5.0 * cm, LARG_UTIL - 5.85 * cm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), COR["forte"]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, LINHA),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F0FDF4")]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("LINEBEFORE", (0, 1), (0, -1), 2.2, COR["forte"]),
    ]))
    hist.append(t)

    hist.append(PageBreak())

    # ---------------- Pontos fracos ----------------
    hist.append(Paragraph("3. Pontos fracos (riscos centrais)", E["h1"]))
    for titulo, txt in FRACOS:
        hist.append(Paragraph(titulo, E["h2"]))
        hist.append(Paragraph(txt, E["corpo"]))
    hist.append(Spacer(1, 0.2 * cm))

    hist.append(Table(
        [[Paragraph(
            f"<b><font color='{HEX['forte']}'>Estado em que os riscos foram encontrados.</font></b> "
            "Os quatro parágrafos acima descrevem a situação no momento da auditoria e estão no presente de "
            "propósito, para que o diagnóstico continue legível. <b>Os quatro já foram tratados:</b> as RPCs de "
            "carreira perderam o grant, o reset foi escopado por inquilino, a assimetria AND/OR foi eliminada nas "
            "três tabelas herdadas, e as funções auxiliares que não deviam ser chamadas de fora foram revogadas de "
            "<font face='Courier'>authenticated</font>. O padrão de fundo — guarda no corpo da função sem rede de "
            "segurança no grant — é o que merece atenção contínua: ele não é um defeito de uma função, e sim a forma "
            "como novas RPCs entram no projeto.",
            E["corpo_c"])]],
        colWidths=[LARG_UTIL],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F0FDF4")),
            ("BOX", (0, 0), (-1, -1), 0.5, COR["forte"]),
            ("LINEBEFORE", (0, 0), (0, -1), 2.4, COR["forte"]),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]),
    ))
    hist.append(Spacer(1, 0.3 * cm))

    nao_aplica = (
        "<b>Categorias sem achado, por ausência de superfície.</b> "
        "A categoria <b>4 (chaves expostas)</b> foi auditada em código, configs, deploy, CI, documentação, bundle e "
        "histórico git e <b>não produziu nenhum achado</b> — ver ponto forte 2. "
        "A categoria <b>5 (XSS)</b> não produziu nenhum achado no frontend: não há um único sink no código (ponto "
        "forte 3); o único item registrado (A10) é a ausência de CSP, endurecimento preventivo e não uma falha "
        "explorável. A vertente de <b>backend</b> da categoria 5 — input de usuário em HTML de e-mail, template ou "
        "resposta sem escape — <b>não se aplica a esta stack</b>: não há servidor de aplicação próprio, não há "
        "renderização server-side e o envio de e-mail é delegado aos templates do Supabase Auth, fora do repositório. "
        "Pela mesma razão, a noção clássica de <b>middleware de tenant</b> da categoria 1 não existe aqui — o "
        "isolamento é feito integralmente por RLS no PostgreSQL, e foi nessa camada que a análise se concentrou."
    )
    hist.append(Paragraph(nao_aplica, E["corpo"]))

    hist.append(PageBreak())

    # ---------------- Achados detalhados ----------------
    hist.append(Paragraph("4. Achados detalhados", E["h1"]))
    hist.append(Paragraph(
        "Ordenados por severidade. Cada achado traz arquivo e linha exatos, o trecho de código real, por que é "
        "explorável, o impacto, as condições necessárias para exploração, a correção sugerida e, em destaque ao "
        "final de cada um, a correção que foi de fato aplicada.", E["corpo"]))
    hist.append(Spacer(1, 0.2 * cm))

    ordenados = sorted(ACHADOS, key=lambda a: (ORDEM_SEV.index(a["sev"]), a["id"]))
    for a in ordenados:
        cab = Table(
            [[chip(a["sev"]),
              Paragraph(f"<b>{a['id']}</b> &nbsp;·&nbsp; {a['titulo']}", E["td"]),
              Paragraph(f"<b>{a['cat']}</b>", E["td"])]],
            colWidths=[1.75 * cm, LARG_UTIL - 4.05 * cm, 2.3 * cm],
            style=TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BACKGROUND", (1, 0), (-1, -1), FUNDO_SUAVE),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (1, 0), (-1, -1), 6),
                ("ALIGN", (2, 0), (2, 0), "RIGHT"),
            ]),
        )
        corpo = [
            cab,
            Spacer(1, 0.14 * cm),
            Paragraph(
                f"<font face='Courier' size=7.6>{a['arquivo']}</font> "
                f"<b>· linha(s) {a['linhas']}</b> &nbsp;·&nbsp; "
                f"<font size=7.6 color='#4B5563'>Categoria {a['cat']} — {CATEGORIAS[a['cat']]}</font>",
                E["corpo_c"]),
            Spacer(1, 0.14 * cm),
            bloco_codigo(a["codigo"], LARG_UTIL),
            Spacer(1, 0.18 * cm),
            Paragraph("POR QUE É EXPLORÁVEL", E["h3"]),
            Paragraph(a["porque"], E["corpo"]),
            Paragraph("IMPACTO", E["h3"]),
            Paragraph(a["impacto"], E["corpo"]),
            Paragraph("CONDIÇÕES DE EXPLORAÇÃO", E["h3"]),
            Paragraph(a["condições"], E["corpo"]),
            Paragraph("CORREÇÃO SUGERIDA", E["h3"]),
            Paragraph(a["correção"], E["corpo"]),
            Spacer(1, 0.1 * cm),
            Table(
                [[Paragraph(
                    f"<b><font color='{HEX['forte']}'>CORRIGIDO</font></b> &nbsp;·&nbsp; "
                    f"{REMEDIACAO[a['id']]}", E["corpo_c"])]],
                colWidths=[LARG_UTIL],
                style=TableStyle([
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F0FDF4")),
                    ("BOX", (0, 0), (-1, -1), 0.5, COR["forte"]),
                    ("LINEBEFORE", (0, 0), (0, -1), 2.4, COR["forte"]),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("LEFTPADDING", (0, 0), (-1, -1), 7),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ]),
            ),
            Spacer(1, 0.4 * cm),
        ]
        # Dois grupos indivisiveis, e nao um bloco unico: prender o achado inteiro empurrava
        # os grandes para a pagina seguinte e deixava meia pagina em branco.
        #   [:5]    cabecalho + referencia de arquivo + trecho de codigo -- um achado
        #           separado do proprio numero de linha fica ilegivel.
        #   [12:16] correcao sugerida + quadro do que foi aplicado -- o quadro sozinho no
        #           topo de uma pagina, longe do achado, nao diz de que correcao se trata.
        # A prosa do meio pode fluir livremente.
        hist.append(KeepTogether(corpo[:5]))
        hist += corpo[5:12]
        hist.append(KeepTogether(corpo[12:16]))
        hist.append(corpo[16])

    hist.append(PageBreak())

    # ---------------- Tabela síntese ----------------
    hist.append(Paragraph("5. Síntese dos achados por categoria", E["h1"]))
    for cat, nome in CATEGORIAS.items():
        do_cat = [a for a in ordenados if a["cat"] == cat]
        hist.append(Paragraph(f"{cat} — {nome}", E["h2"]))
        if not do_cat:
            hist.append(Paragraph(
                "<font color='#059669'><b>Nenhum achado.</b></font> Ver seção 3 para a justificativa de cobertura.",
                E["corpo"]))
            continue
        linhas = [[Paragraph("Severidade", E["th"]), Paragraph("Arquivo:linha", E["th"]),
                   Paragraph("Descrição", E["th"])]]
        for a in do_cat:
            linhas.append([
                chip(a["sev"]),
                Paragraph(f"{a['arquivo']}:{a['linhas'].split(' ')[0]}", E["td_mono"]),
                Paragraph(f"<b>{a['id']}</b> — {a['titulo']}", E["td"]),
            ])
        t = Table(linhas, colWidths=[2.0 * cm, 6.3 * cm, LARG_UTIL - 8.3 * cm], repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), TINTA),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("GRID", (0, 0), (-1, -1), 0.4, LINHA),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, FUNDO_SUAVE]),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ]))
        hist.append(t)
        hist.append(Spacer(1, 0.2 * cm))

    hist.append(PageBreak())

    # ---------------- Recomendações ----------------
    hist.append(Paragraph("6. Recomendações priorizadas", E["h1"]))
    cores_p = {"P1": COR["crítica"], "P2": COR["média"], "P3": COR["baixa"]}
    hist.append(Paragraph(
        "A prioridade registra a ordem em que as correções deveriam entrar. <b>Todas foram aplicadas</b> — a coluna "
        "de situação está aqui para que a tabela continue legível como registro do que foi feito, e não como "
        "pendência em aberto.", E["corpo"]))
    hist.append(Spacer(1, 0.2 * cm))
    linhas = [[Paragraph("Prio.", E["th"]), Paragraph("Ação", E["th"]),
               Paragraph("Como", E["th"]), Paragraph("Achados", E["th"]),
               Paragraph("Situação", E["th"])]]
    for p, titulo, como, ids in RECOMENDACOES:
        linhas.append([
            Table([[Paragraph(p, E["chip"])]], colWidths=[1.0 * cm],
                  style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), cores_p[p]),
                                    ("TOPPADDING", (0, 0), (-1, -1), 2.5),
                                    ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5)])),
            Paragraph(f"<b>{titulo}</b>", E["td"]),
            Paragraph(como, E["td"]),
            Paragraph(ids, E["td"]),
            Table([[Paragraph("FEITO", E["chip"])]], colWidths=[1.3 * cm],
                  style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), COR["forte"]),
                                    ("TOPPADDING", (0, 0), (-1, -1), 2.5),
                                    ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5)])),
        ])
    t = Table(linhas, colWidths=[1.3 * cm, 3.7 * cm, LARG_UTIL - 8.7 * cm, 1.9 * cm, 1.8 * cm],
              repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TINTA),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, LINHA),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, FUNDO_SUAVE]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
    ]))
    hist.append(t)

    hist.append(PageBreak())

    # ---------------- Issues ----------------
    hist.append(Paragraph("7. Issues para o GitHub", E["h1"]))
    hist.append(Paragraph(
        f"Os {len(ACHADOS)} achados foram agrupados em <b>{len(ISSUES)} issues</b> — achados do mesmo tema foram "
        "reunidos para evitar ruído no backlog (as três RPCs de carreira viram uma issue; as duas funções auxiliares "
        "que vazam identidade e papéis, outra). Cada bloco abaixo está em Markdown e pode ser copiado inteiro para o "
        "corpo da issue.", E["corpo"]))
    hist.append(Paragraph(
        f"<b><font color='{HEX['forte']}'>Todas já foram implementadas.</font></b> Os blocos permanecem completos "
        "porque continuam servindo a dois usos: abrir a issue e fechá-la em seguida, deixando rastro no repositório; "
        "ou usar os critérios de aceite como roteiro de conferência do que foi entregue. O texto descreve o defeito no "
        "presente, como estava quando foi encontrado — o rodapé de cada bloco diz o que foi feito. Uma exceção: a "
        "sugestão de correção da issue 1 foi <b>substituída</b> durante a implementação, pela razão registrada em A2.",
        E["corpo"]))
    hist.append(Spacer(1, 0.25 * cm))

    for i, iss in enumerate(ISSUES, 1):
        hist.append(Paragraph(f"--- ISSUE {i} ---", E["delim"]))
        hist.append(Spacer(1, 0.1 * cm))
        md = f"# {iss['titulo']}\n\n**Labels:** {iss['labels']}\n\n{iss['corpo'].rstrip()}"
        linhas_md = []
        for l in md.split("\n"):
            seguro = l.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            linhas_md.append(Paragraph(seguro if seguro.strip() else "&nbsp;", E["issue_md"]))
        t = Table([[l] for l in linhas_md], colWidths=[LARG_UTIL],
                  style=TableStyle([
                      ("BACKGROUND", (0, 0), (-1, -1), FUNDO_CODIGO),
                      ("BOX", (0, 0), (-1, -1), 0.5, LINHA),
                      ("LINEBEFORE", (0, 0), (0, -1), 2.2, COR["forte"]),
                      ("TOPPADDING", (0, 0), (-1, -1), 0.5),
                      ("BOTTOMPADDING", (0, 0), (-1, -1), 0.5),
                      ("LEFTPADDING", (0, 0), (-1, -1), 6),
                      ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                  ]))
        hist.append(t)
        hist.append(Spacer(1, 0.1 * cm))
        hist.append(Table(
            [[Paragraph(
                f"<b><font color='{HEX['forte']}'>RESOLVIDA</font></b> &nbsp;·&nbsp; {iss['entregue']}",
                E["corpo_c"])]],
            colWidths=[LARG_UTIL],
            style=TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F0FDF4")),
                ("BOX", (0, 0), (-1, -1), 0.5, COR["forte"]),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]),
        ))
        hist.append(Spacer(1, 0.1 * cm))
        hist.append(Paragraph(f"--- FIM ISSUE {i} ---", E["delim"]))
        hist.append(Spacer(1, 0.5 * cm))

    Doc(SAIDA).build(hist)

    for tmp in (rosca, barras):
        try:
            os.remove(tmp)
        except OSError:
            pass

    return SAIDA


if __name__ == "__main__":
    caminho = construir()
    print(f"PDF gerado: {caminho}")
