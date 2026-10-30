"""Dispatch only the owner's approved Wave 4 after Wave 3 completes.

Uses the existing campaign journal, Gmail transport, mailbox lock and shared
account limits. Never sends through the unrelated Codex Gmail connector.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sqlite3
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTREACH = ROOT / "outreach"
INDEX = OUTREACH / "WAVE4_INDEX.md"
CONSENTS = OUTREACH / "consents.csv"
CONTACTS = ROOT / "docs" / "CONTACTS.csv"
DB = OUTREACH / "campaign.sqlite3"
SCOPE = OUTREACH / "approved_scope_wave4_2026-09-29.json"
APPROVAL = OUTREACH / "approved_batch_wave4_2026-09-29.json"
ATTESTATION = OUTREACH / "consent_attestation_wave4_2026-09-29.md"
STATUS = OUTREACH / "wave4_dispatch_status.json"
WAVE3 = OUTREACH / "approved_batch_wave3_2026-09-29.json"
CONFIG = OUTREACH / "campaign.json"
PYTHON = Path(r"E:\open-claw-agent\.venv\Scripts\python.exe")
BATCH_SCRIPT = Path(r"E:\open-claw-agent\scripts\otpremaops_approved_batch.py")
TASK_NAME = "OpenClaw OtpremaOps Approved Wave4"
STATEMENT = "ещё отправь письма; все согласны; из папки serbiya"
CSV_FIELDS = ["email", "status", "basis", "evidence", "recorded_at", "scope"]


def now():
    return datetime.now(timezone.utc)


def write_json(path: Path, value: dict):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def index_rows():
    rows = []
    pattern = re.compile(r"^\|\s*(\d+)\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*\[Сербский текст\]\((drafts/first_[a-f0-9]+\.txt)\)\s*\|$")
    for line in INDEX.read_text(encoding="utf-8").splitlines():
        match = pattern.fullmatch(line.strip())
        if match:
            number, company, email, draft = match.groups()
            rows.append({"number": int(number), "company": company.strip(), "email": email.strip().lower(), "draft": draft})
    if len(rows) != 20 or [row["number"] for row in rows] != list(range(1, 21)):
        raise ValueError("Wave 4 index must contain exactly twenty numbered letters")
    if len({row["email"] for row in rows}) != 20:
        raise ValueError("Wave 4 contains a duplicate address")
    return rows


def audit_rows(rows):
    with CONTACTS.open(encoding="utf-8-sig", newline="") as handle:
        contacts = list(csv.DictReader(handle))
    with CONSENTS.open(encoding="utf-8-sig", newline="") as handle:
        consents = list(csv.DictReader(handle))
    if list(consents[0]) != CSV_FIELDS:
        raise ValueError("Consent CSV columns changed")
    with sqlite3.connect(DB.as_uri() + "?mode=ro", uri=True) as db:
        stops = {row[0] for row in db.execute("SELECT email FROM stops")}
        claims = {row[0]: row[1] for row in db.execute("SELECT email,state FROM outbound WHERE kind='first'")}
    for row in rows:
        email = row["email"]
        matching_contacts = [contact for contact in contacts if contact["email"].lower() == email]
        matching_consents = [consent for consent in consents if consent["email"].lower() == email]
        if len(matching_contacts) != 1 or len(matching_consents) != 1:
            raise ValueError(f"Contact/consent registry mismatch: {email}")
        if matching_contacts[0]["company"] != row["company"]:
            raise ValueError(f"Company mismatch: {email}")
        if email in stops or email in claims:
            raise ValueError(f"Stopped or already claimed: {email}")
        if matching_consents[0]["status"] not in {"unknown", "confirmed"}:
            raise ValueError(f"Unexpected consent status: {email}")
        draft_path = OUTREACH / row["draft"]
        if not draft_path.is_file():
            raise ValueError(f"Missing draft: {email}")
        content = draft_path.read_text(encoding="utf-8")
        if not content.startswith(f"To: {email}\nSubject: [OtpremaOps]") or len(content.split("\n\n", 1)) != 2:
            raise ValueError(f"Invalid draft: {email}")
    with WAVE3.open(encoding="utf-8") as handle:
        wave3 = json.load(handle)
    if set(wave3["emails"]) & {row["email"] for row in rows}:
        raise ValueError("Wave 4 overlaps Wave 3")
    return {"wave4": len(rows), "drafts": len(rows), "distinct_companies": len({row["company"] for row in rows})}


def create_scope():
    rows = index_rows()
    summary = audit_rows(rows)
    if SCOPE.exists() or ATTESTATION.exists() or APPROVAL.exists():
        raise ValueError("Wave 4 approval already exists; inspect current status")
    stamp = now()
    scope = {
        "campaign_id": "otpremaops-serbia",
        "sender": "koallalenivaa@gmail.com",
        "approved_at": stamp.isoformat(),
        "valid_until": (stamp + timedelta(hours=47)).isoformat(),
        "owner_statement": STATEMENT,
        "emails": [row["email"] for row in rows],
    }
    content = [
        "# Подтверждение владельца: четвёртая партия OtpremaOps",
        "",
        f"Дата: {stamp.isoformat()}",
        f"Ответ владельца в этой сессии: «{STATEMENT}».",
        "Подтверждение относится только к двадцати адресам WAVE4_INDEX.md и письмам об OtpremaOps.",
        "Независимых документов о согласии адресатов агент не получал; это запись заявления владельца.",
        "Отправка следует после завершения Wave 3 и использует существующий журнал, почтовую блокировку и общие лимиты.",
        "",
    ]
    content.extend(f"- {row['company']} — {row['email']}" for row in rows)
    ATTESTATION.write_text("\n".join(content) + "\n", encoding="utf-8")
    write_json(SCOPE, scope)
    write_json(STATUS, {"status": "awaiting_wave3", "approved_at": scope["approved_at"], "requested": 20, "accepted": 0})
    return summary


def wave3_progress():
    emails = set(read_json(WAVE3)["emails"])
    with sqlite3.connect(DB.as_uri() + "?mode=ro", uri=True) as db:
        claims = [(email, state) for email, state in db.execute("SELECT email,state FROM outbound WHERE kind='first'") if email in emails]
    return {"accepted": sum(state == "sent" for _, state in claims), "uncertain": sum(state in {"unknown", "sending"} for _, state in claims), "rejected": sum(state == "rejected" for _, state in claims)}


def wave4_progress(emails):
    with sqlite3.connect(DB.as_uri() + "?mode=ro", uri=True) as db:
        states = [state for email, state in db.execute("SELECT email,state FROM outbound WHERE kind='first'") if email in set(emails)]
    return {"accepted": states.count("sent"), "attempted": len(states), "uncertain": sum(state in {"unknown", "sending"} for state in states), "rejected": states.count("rejected")}


def disable_own_task():
    # Only the task created for this wave; the running Wave 3/regular tasks remain intact.
    script = str(Path(__file__).resolve()).replace("'", "''")
    name = TASK_NAME.replace("'", "''")
    command = (
        f"$ownTask = Get-ScheduledTask -TaskName '{name}' -ErrorAction SilentlyContinue\n"
        f"if ($ownTask -and $ownTask.Actions.Arguments -like '*{script}*') {{ "
        f"Disable-ScheduledTask -TaskName '{name}' | Out-Null }}"
    )
    subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command], timeout=20, capture_output=True, check=False, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))


def record(status, **details):
    value = {"checked_at": now().isoformat(), "status": status, "requested": 20, **details}
    write_json(STATUS, value)
    print(json.dumps(value, ensure_ascii=False), flush=True)
    return value


def activate(scope, rows):
    if not APPROVAL.exists():
        with sqlite3.connect(DB.as_uri() + "?mode=ro", uri=True) as db:
            baseline = db.execute("SELECT COUNT(*) FROM outbound").fetchone()[0]
        if baseline > 80:
            raise ValueError("Campaign batch baseline exceeds bounded budget")
        approval = {
            "campaign_id": scope["campaign_id"], "sender": scope["sender"],
            "approved_at": scope["approved_at"], "valid_until": scope["valid_until"],
            "continued_at": now().isoformat(),
            "continuation_statement": "Отправить после Wave 3 по текущему поручению владельца",
            "owner_statement": scope["owner_statement"],
            "baseline_attempts": baseline, "emails": scope["emails"],
        }
        write_json(APPROVAL, approval)
    with CONSENTS.open(encoding="utf-8-sig", newline="") as handle:
        records = list(csv.DictReader(handle))
    targets = set(scope["emails"])
    changed = False
    for row in records:
        if row["email"].lower() not in targets:
            continue
        if row["status"] == "confirmed":
            if row["evidence"] != ATTESTATION.name or row["scope"] != "otpremaops_email":
                raise ValueError("Wave 4 consent was changed outside this approval")
            continue
        if row["status"] != "unknown":
            raise ValueError("Unexpected consent status during activation")
        row.update(status="confirmed", basis="explicit_consent", evidence=ATTESTATION.name, recorded_at=scope["approved_at"], scope="otpremaops_email")
        changed = True
    if changed:
        buffer = io.StringIO(newline="")
        writer = csv.DictWriter(buffer, fieldnames=CSV_FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(records)
        temporary = CONSENTS.with_suffix(".csv.tmp")
        temporary.write_text(buffer.getvalue(), encoding="utf-8")
        os.replace(temporary, CONSENTS)


def run_once():
    scope = read_json(SCOPE)
    rows = index_rows()
    if scope["emails"] != [row["email"] for row in rows]:
        raise ValueError("Wave 4 index changed after approval")
    if now() >= datetime.fromisoformat(scope["valid_until"]):
        record("expired", **wave4_progress(scope["emails"]))
        disable_own_task()
        return 0
    state3 = wave3_progress()
    if state3["uncertain"] or state3["rejected"]:
        record("awaiting_wave3_review", wave3=state3)
        return 0
    if state3["accepted"] < 20:
        record("awaiting_wave3", wave3=state3)
        return 0
    if not APPROVAL.exists():
        audit_rows(rows)
    activate(scope, rows)
    result = subprocess.run([str(PYTHON), str(BATCH_SCRIPT), "--config", str(CONFIG), "--approval", str(APPROVAL), "--once"], cwd=str(BATCH_SCRIPT.parent.parent), capture_output=True, text=True, timeout=300, check=False, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    batch_status = APPROVAL.with_name(APPROVAL.stem + "_status.json")
    if batch_status.exists():
        batch = read_json(batch_status)
        summary = {key: batch.get(key) for key in ("reason", "accepted", "attempted", "rejected", "uncertain")}
        record("batch_" + str(batch["status"]), **summary)
        if batch["status"] in {"complete", "complete_with_exclusions", "stopped_attempt_requires_review", "stopped", "failed"}:
            disable_own_task()
    else:
        record("waiting_batch_status", returncode=result.returncode)
    return result.returncode


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["validate", "init", "once"])
    args = parser.parse_args()
    if args.action == "validate":
        print(json.dumps(audit_rows(index_rows()), ensure_ascii=False))
        return 0
    if args.action == "init":
        print(json.dumps(create_scope(), ensure_ascii=False))
        return 0
    try:
        sys.path.insert(0, str(BATCH_SCRIPT.parent.parent))
        from src.runtime_lock import RuntimeLockError, acquire_runtime_lock
        guard = acquire_runtime_lock(OUTREACH, "approved_wave4_dispatch")
    except RuntimeLockError:
        print('{"status":"already_running"}')
        return 0
    try:
        return run_once()
    except Exception as exc:
        record("failed", error_type=type(exc).__name__)
        disable_own_task()
        return 1
    finally:
        guard.release()


if __name__ == "__main__":
    raise SystemExit(main())
