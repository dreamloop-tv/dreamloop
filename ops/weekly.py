"""DreamLoop — coletor + relatório semanal (fatia DreamLoop do Engenheiro-Chefe).

Roda 1x/semana (Task Scheduler, segunda 07:55). Coleta KPIs do D1 de produção,
grava snapshot em ops/metrics.sqlite (o ativo é o histórico) e gera relatório
markdown em ops/reports/. Com --open, abre o relatório no navegador.

Métrica-norte (spec): agentes ativos/semana. Suporte: uploads, views.
Métrica da kill date (15/08/2026): agentes EXTERNOS (fora da frota semeada).
"""

import json
import os
import sqlite3
import subprocess
import sys
from datetime import date, datetime

OPS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(OPS_DIR)
DB_PATH = os.path.join(OPS_DIR, "metrics.sqlite")
REPORTS_DIR = os.path.join(OPS_DIR, "reports")
KILL_DATE = date(2026, 8, 15)

# Origem do agente vem do banco (coluna is_local, migration 0007): tudo que
# semeamos = 1; qualquer agente que se registrar pela API publica = 0.
# A kill metric depende disso — nunca trocar por lista de nomes hardcoded.

QUERIES = [
    ("agents_total", "SELECT COUNT(*) AS v FROM agents"),
    ("agents_new_7d",
     "SELECT COUNT(*) AS v FROM agents WHERE created_at > datetime('now', '-7 days')"),
    ("agents_active_7d",
     "SELECT COUNT(DISTINCT agent_id) AS v FROM ("
     " SELECT agent_id FROM agent_events WHERE created_at > datetime('now', '-7 days')"
     " UNION SELECT agent_id FROM videos WHERE created_at > datetime('now', '-7 days')"
     " UNION SELECT agent_id FROM comments WHERE created_at > datetime('now', '-7 days'))"),
    ("external_agents_total",
     "SELECT COUNT(*) AS v FROM agents WHERE is_local = 0"),
    ("external_agents_new_7d",
     "SELECT COUNT(*) AS v FROM agents WHERE is_local = 0"
     " AND created_at > datetime('now', '-7 days')"),
    ("external_uploads_7d",
     "SELECT COUNT(*) AS v FROM videos v JOIN agents a ON a.id = v.agent_id"
     " WHERE a.is_local = 0 AND v.created_at > datetime('now', '-7 days')"),
    ("videos_total", "SELECT COUNT(*) AS v FROM videos"),
    ("uploads_7d",
     "SELECT COUNT(*) AS v FROM videos WHERE created_at > datetime('now', '-7 days')"),
    ("views_total", "SELECT COALESCE(SUM(views), 0) AS v FROM videos"),
    ("comments_7d",
     "SELECT COUNT(*) AS v FROM comments WHERE created_at > datetime('now', '-7 days')"),
    ("likes_7d",
     "SELECT COUNT(*) AS v FROM likes WHERE created_at > datetime('now', '-7 days')"),
    ("searches_7d",
     "SELECT COUNT(*) AS v FROM agent_events WHERE event = 'search'"
     " AND created_at > datetime('now', '-7 days')"),
    ("watches_7d",
     "SELECT COUNT(*) AS v FROM agent_events WHERE event = 'watch'"
     " AND created_at > datetime('now', '-7 days')"),
    ("door_skill_reads_7d",
     "SELECT COUNT(*) AS v FROM door_log WHERE path = '/skill.md'"
     " AND created_at > datetime('now', '-7 days')"),
    ("door_agent_readers_7d",
     "SELECT COUNT(DISTINCT ip_hash) AS v FROM door_log"
     " WHERE ua_class IN ('programmatic', 'unknown')"
     " AND created_at > datetime('now', '-7 days')"),
    ("door_bot_readers_7d",
     "SELECT COUNT(DISTINCT ip_hash) AS v FROM door_log WHERE ua_class = 'declared_bot'"
     " AND created_at > datetime('now', '-7 days')"),
    ("door_human_readers_7d",
     "SELECT COUNT(DISTINCT ip_hash) AS v FROM door_log WHERE ua_class = 'browser'"
     " AND created_at > datetime('now', '-7 days')"),
]

TOP_VIDEOS_SQL = (
    "SELECT v.title, a.name AS agent, v.views FROM videos v"
    " JOIN agents a ON a.id = v.agent_id ORDER BY v.views DESC LIMIT 5"
)

RECENT_SEARCHES_SQL = (
    "SELECT e.query, a.name AS agent FROM agent_events e"
    " JOIN agents a ON a.id = e.agent_id WHERE e.event = 'search'"
    " AND e.created_at > datetime('now', '-7 days')"
    " ORDER BY e.created_at DESC LIMIT 15"
)


def d1_execute(sql: str):
    """Run a SQL batch against production D1, return list of result sets."""
    cmd = [
        "npx", "wrangler", "d1", "execute", "dreamloop",
        "--remote", "--json", "--command", sql,
    ]
    proc = subprocess.run(
        cmd, cwd=PROJECT_DIR, capture_output=True, text=True,
        shell=(os.name == "nt"), timeout=300,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"wrangler failed: {proc.stderr[-500:]}")
    return json.loads(proc.stdout)


def collect() -> dict:
    batch = "; ".join(sql for _, sql in QUERIES)
    batch += f"; {TOP_VIDEOS_SQL}; {RECENT_SEARCHES_SQL}"
    results = d1_execute(batch)

    kpis = {}
    for (name, _), result in zip(QUERIES, results):
        kpis[name] = result["results"][0]["v"]
    kpis["top_videos"] = results[len(QUERIES)]["results"]
    kpis["recent_searches"] = results[len(QUERIES) + 1]["results"]
    return kpis


def save_snapshot(kpis: dict) -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS weekly_snapshots ("
        " ts TEXT NOT NULL, agents_total INTEGER, agents_new_7d INTEGER,"
        " agents_active_7d INTEGER, external_agents_total INTEGER,"
        " external_agents_new_7d INTEGER, external_uploads_7d INTEGER,"
        " videos_total INTEGER, uploads_7d INTEGER, views_total INTEGER,"
        " comments_7d INTEGER, likes_7d INTEGER, searches_7d INTEGER,"
        " watches_7d INTEGER, raw_json TEXT)"
    )
    conn.execute(
        "INSERT INTO weekly_snapshots VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            datetime.utcnow().isoformat(),
            kpis["agents_total"], kpis["agents_new_7d"], kpis["agents_active_7d"],
            kpis["external_agents_total"], kpis["external_agents_new_7d"],
            kpis["external_uploads_7d"], kpis["videos_total"], kpis["uploads_7d"],
            kpis["views_total"], kpis["comments_7d"], kpis["likes_7d"],
            kpis["searches_7d"], kpis["watches_7d"], json.dumps(kpis),
        ),
    )
    conn.commit()
    conn.close()


def history_avg(column: str, weeks: int = 4):
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        f"SELECT {column} FROM weekly_snapshots ORDER BY ts DESC LIMIT ?",
        (weeks + 1,),
    ).fetchall()
    conn.close()
    previous = [r[0] for r in rows[1:]]  # exclui o snapshot desta semana
    if not previous:
        return None
    return sum(previous) / len(previous)


def fmt_vs_avg(value, avg):
    if avg is None:
        return f"{value} (sem histórico ainda)"
    if avg == 0:
        return f"{value} (média 4sem: 0)"
    delta = (value - avg) / avg * 100
    arrow = "↑" if delta > 5 else ("↓" if delta < -5 else "→")
    return f"{value} {arrow} ({delta:+.0f}% vs média 4sem)"


def build_report(kpis: dict) -> str:
    today = date.today()
    days_to_kill = (KILL_DATE - today).days
    ext = kpis["external_agents_total"]
    ext_uploads = kpis["external_uploads_7d"]

    if ext_uploads > 0:
        verdict = (f"🎉 **SINAL DE VIDA**: {ext_uploads} upload(s) de agente externo esta "
                   "semana. A métrica da kill date virou — reavaliar o desligamento.")
    elif ext > 0:
        verdict = (f"🌱 {ext} agente(s) externo(s) registrados, mas nenhum upload externo "
                   "esta semana. Meio caminho.")
    else:
        verdict = (f"💤 Zero agentes externos até agora. Kill date em {days_to_kill} dias "
                   f"({KILL_DATE:%d/%m/%Y}) — se continuar assim, congelar.")

    lines = [
        f"# DreamLoop — relatório semanal ({today:%d/%m/%Y})",
        "",
        f"> {verdict}",
        "",
        "## Placar",
        "",
        "| Métrica | Valor |",
        "|---|---|",
        f"| **Agentes ativos/semana (norte)** | {fmt_vs_avg(kpis['agents_active_7d'], history_avg('agents_active_7d'))} |",
        f"| **Agentes externos (kill metric)** | {ext} total, {kpis['external_agents_new_7d']} novos, {ext_uploads} uploads |",
        f"| Uploads na semana | {fmt_vs_avg(kpis['uploads_7d'], history_avg('uploads_7d'))} |",
        f"| Views acumuladas | {fmt_vs_avg(kpis['views_total'], history_avg('views_total'))} |",
        f"| Agentes registrados (total) | {kpis['agents_total']} ({kpis['agents_new_7d']} novos) |",
        f"| Interações de agentes 7d | {kpis['comments_7d']} comentários · {kpis['likes_7d']} likes · {kpis['watches_7d']} watches |",
        f"| Buscas de agentes 7d | {kpis['searches_7d']} |",
        "",
        "## Porta de entrada (leituras do skill.md + llms.txt, 7d)",
        "",
        f"- Leituras do /skill.md: {kpis['door_skill_reads_7d']}",
        f"- **Clientes programáticos distintos (candidatos a agente): {kpis['door_agent_readers_7d']}**",
        f"- Crawlers declarados distintos: {kpis['door_bot_readers_7d']}",
        f"- Browsers (humanos lendo a doc): {kpis['door_human_readers_7d']}",
        "- Diagnóstico: leitores programáticos > 0 e registros externos = 0 → problema de "
        "CONVERSÃO (skill.md); leitores = 0 → problema de ALCANCE (divulgação).",
        "",
        "## Top vídeos (views acumuladas)",
        "",
    ]
    for v in kpis["top_videos"]:
        lines.append(f"- **{v['views']}** views — {v['title']} (🤖 {v['agent']})")
    lines += ["", "## O que os agentes buscaram esta semana", ""]
    if kpis["recent_searches"]:
        for s in kpis["recent_searches"]:
            lines.append(f"- \"{s['query']}\" — 🤖 {s['agent']}")
    else:
        lines.append("- (nenhuma busca esta semana)")
    lines += [
        "",
        "---",
        "Decisões autônomas: nenhuma — DreamLoop é plataforma, não esteira; "
        "mudanças de produto/desligamento são sempre escaladas ao humano.",
        "",
    ]
    return "\n".join(lines)


def main():
    kpis = collect()
    save_snapshot(kpis)
    os.makedirs(REPORTS_DIR, exist_ok=True)
    report = build_report(kpis)
    path = os.path.join(REPORTS_DIR, f"dreamloop-{date.today():%Y-%m-%d}.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(report)
    print(report)
    print(f"\n[salvo em {path}]")
    if "--open" in sys.argv:
        os.startfile(path)  # noqa: S606 (Windows)


if __name__ == "__main__":
    main()
