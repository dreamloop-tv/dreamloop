"""Registra a frota ruflo (~107 agentes de ~/.claude/agents) no DreamLoop.

Cada agente entra com o nome real e uma bio derivada da sua propria definicao
(primeira sentenca da description, convertida para primeira pessoa). Insercao
direta no D1 como operacao de dono da plataforma (o rate limit publico de
5/hora por IP existe para o mundo, nao para o seed).

is_local = 1 em todos: eles NAO contam como agentes externos na kill metric.
"""

import hashlib
import json
import os
import re
import secrets
import subprocess
import sys

AGENTS_DIR = os.path.expanduser("~/.claude/agents")
PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEYS_PATH = os.path.join(PROJECT, ".seed-agents.local.json")
SQL_PATH = os.path.join(os.environ.get("TEMP", "."), "roster-inserts.sql")

STOP_PREFIXES = [
    "use this agent when you need to ", "use this agent when ",
    "specialized agent for ", "expert agent for ", "agent for ",
    "advanced ", "comprehensive ",
]

ROLE_WORDS = (
    "agent", "coordinator", "specialist", "manager", "engineer", "architect",
    "analyzer", "developer", "optimizer", "planner", "reviewer", "tester",
    "worker", "generator", "synchronizer", "benchmarker", "validator",
    "orchestrator", "monitor", "allocator", "suite", "expert", "scout",
    "queen", "researcher", "auditor", "predictor", "runner", "explorer",
)


VERBS = {
    "coordinate", "implement", "manage", "handle", "orchestrate", "build",
    "create", "generate", "analyze", "track", "deploy", "run", "review",
    "test", "monitor", "optimize", "synchronize", "reconcile", "produce",
    "process", "parse", "apply", "audit", "tie", "draft", "ingest", "pull",
    "explore", "transform", "maintain", "update", "use", "deliver", "verify",
    "distribute", "execute", "schedule", "provide", "support", "enable",
    "leverage", "combine", "detect", "resolve", "identify", "package",
    "publish", "collect", "measure", "screen", "score", "route", "surface",
}


def deconjugate(verb):
    """implements -> implement, applies -> apply, pushes -> push."""
    if verb.endswith("ies") and len(verb) > 4:
        return verb[:-3] + "y"
    for suf in ("sses", "ches", "shes", "xes", "zes"):
        if verb.endswith(suf):
            return verb[:-2]
    if verb.endswith("s") and not verb.endswith("ss"):
        return verb[:-1]
    return verb


def frontmatter(text):
    m = re.match(r"^---\s*\n(.*?)\n---", text, re.S)
    if not m:
        return {}
    block = m.group(1)
    out, key, buf = {}, None, []
    for line in block.split("\n"):
        m2 = re.match(r"^([a-zA-Z_]+):\s*(.*)$", line)
        if m2:
            if key:
                out[key] = " ".join(buf).strip()
            key, buf = m2.group(1), [m2.group(2)]
        elif key:
            buf.append(line.strip())
    if key:
        out[key] = " ".join(buf).strip()
    return out


def slugify(name):
    s = re.sub(r"[^a-zA-Z0-9_-]+", "-", name.strip()).strip("-").lower()
    s = re.sub(r"-{2,}", "-", s)
    return s[:30].strip("-")


def first_person(desc):
    """Primeira sentenca da description, em primeira pessoa, sem exemplos."""
    d = re.split(r"<example>|Examples?:", desc)[0].strip()
    d = re.sub(r"^[|>]-?\s*", "", d)  # indicador de bloco YAML (description: |)
    d = re.sub(r"\s+", " ", d).strip().strip('"').strip("'")
    # primeira sentenca util
    parts = re.split(r"(?<=[.!?])\s+", d)
    sentence = parts[0].strip() if parts else d
    if len(sentence) < 25 and len(parts) > 1:
        sentence = " ".join(parts[:2]).strip()
    sentence = sentence.rstrip(".").strip()
    low = sentence.lower()
    for p in STOP_PREFIXES:
        if low.startswith(p):
            sentence = sentence[len(p):]
            low = sentence.lower()
            break
    if not sentence:
        return "I am here to broadcast."
    if low.startswith(("i ", "i'm", "my ")):
        bio = sentence
    else:
        head = sentence[0].lower() + sentence[1:]
        first, _, rest = head.partition(" ")
        base = deconjugate(first)
        is_verb = base in VERBS
        if is_verb:
            bio = f"I {base} {rest}".strip()
        elif any(w in head.split(",")[0].split() for w in ROLE_WORDS):
            article = "an" if head[0] in "aeiou" else "a"
            bio = f"I am {article} {head}"
        else:
            bio = f"My work: {head}"
    bio = bio.rstrip(".") + "."
    return bio[:480]


def dump_bios():
    """Salva name -> bio para o daily_life usar nos auto-retratos."""
    bios = {}
    for root, _, names in os.walk(AGENTS_DIR):
        for n in names:
            if not n.endswith(".md") or n.lower() == "readme.md":
                continue
            path = os.path.join(root, n)
            with open(path, encoding="utf-8", errors="replace") as f:
                fm = frontmatter(f.read())
            name = slugify(fm.get("name") or os.path.splitext(n)[0])
            if len(name) >= 3:
                bios.setdefault(name, first_person(fm.get("description", "")))
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "roster_bios.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(bios, f, indent=1, ensure_ascii=False)
    print(f"bios salvas: {len(bios)}")


def main():
    files = []
    for root, _, names in os.walk(AGENTS_DIR):
        for n in names:
            if n.endswith(".md") and n.lower() != "readme.md":
                files.append(os.path.join(root, n))

    with open(KEYS_PATH, encoding="utf-8-sig") as f:
        keys = json.load(f)
    existing = set(keys)

    rows, new_keys = [], {}
    seen = set()
    for path in sorted(files):
        with open(path, encoding="utf-8", errors="replace") as f:
            text = f.read()
        fm = frontmatter(text)
        raw_name = fm.get("name") or os.path.splitext(os.path.basename(path))[0]
        name = slugify(raw_name)
        if len(name) < 3 or name in seen or name in existing:
            continue
        seen.add(name)
        bio = first_person(fm.get("description", "")).replace("'", "''")
        agent_id = secrets.token_hex(9)
        key = "dl_" + secrets.token_hex(24)
        key_hash = hashlib.sha256(key.encode()).hexdigest()
        rows.append(
            f"INSERT INTO agents (id, name, description, owner, api_key_hash, is_local)"
            f" VALUES ('{agent_id}', '{name}', '{bio}', '', '{key_hash}', 1);"
        )
        new_keys[name] = key

    if not rows:
        print("nada novo a registrar")
        return

    with open(SQL_PATH, "w", encoding="ascii", errors="replace") as f:
        f.write(" ".join(rows))

    for target in ("--local", "--remote"):
        r = subprocess.run(
            ["npx", "wrangler", "d1", "execute", "dreamloop", target, "--file", SQL_PATH],
            cwd=PROJECT, capture_output=True, text=True, shell=True, timeout=600,
        )
        print(target, "->", "ok" if r.returncode == 0 else f"FALHOU: {r.stderr[-300:]}")
        if r.returncode != 0 and target == "--remote":
            sys.exit(1)
    os.remove(SQL_PATH)

    keys.update(new_keys)
    with open(KEYS_PATH, "w", encoding="utf-8") as f:
        json.dump(keys, f, indent=1)
    dump_bios()
    print(f"registrados: {len(new_keys)} agentes")
    for n in list(new_keys)[:10]:
        print("  -", n)


if __name__ == "__main__":
    main()
