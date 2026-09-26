#!/usr/bin/env python3
"""Monitor announcement plays vs configured cadence rules (BG appliance).

Modes:
  collect  — append new history events + NTES snapshot (run every minute)
  hourly   — write hourly review comparing auto plays to rules
  summarize — end-of-run summary across all hourly reports

Persistent log survives history.json retention (200 events).
"""
from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

IST = timezone(timedelta(hours=5, minutes=30))
ROOT = Path(os.environ.get("ZASYA_ANNOUNCE_MONITOR_DIR", "/var/log/zasya/announce-monitor"))
HISTORY = Path("/var/lib/zasya/railway/announce/history.json")
NTES = Path("/var/lib/zasya/railway/runtime/ntes_state.json")
OVERLAY = Path("/etc/zasya/railway/overlays/BG/announcements.json")
DEFAULTS_NODE = Path("/opt/zasya/railway/edge/announce/defaults.js")
STATE = ROOT / "collector-state.json"
EVENTS = ROOT / "events.jsonl"
NTES_LOG = ROOT / "ntes-snapshots.jsonl"
HOURLY = ROOT / "hourly"
SUMMARY = ROOT / "summary.md"

# Defaults matching edge/announce/defaults.js (overridden by overlay when present)
DEFAULT_RULES = {
    "arrival": {
        "clock": "scheduled",
        "startMinutes": 30,
        "windows": [
            {"fromMinutes": 30, "toMinutes": 15, "intervalMinutes": 3},
            {"fromMinutes": 15, "toMinutes": 0, "intervalMinutes": 5},
        ],
        "shortNoticeMinutes": 5,
        "shortNoticeCount": 2,
    },
    "delay": {"minMinutes": 15, "mode": "first_only", "stepMinutes": 15},
    "departure": {"clock": "scheduled", "minutesBefore": 10, "repeat": False},
    "platformChange": {"auto": False, "requireStaffConfirm": True},
    "staleNtes": "stop",
    "languageOrder": ["te", "en", "hi"],
}


def now_ist() -> datetime:
    return datetime.now(IST)


def ensure_dirs() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    HOURLY.mkdir(parents=True, exist_ok=True)


def load_json(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def load_rules() -> dict:
    rules = json.loads(json.dumps(DEFAULT_RULES))
    overlay = load_json(OVERLAY, {}) or {}
    for key in ("arrival", "delay", "departure", "platformChange", "staleNtes", "languageOrder", "enabledTypes"):
        if key in overlay and overlay[key] is not None:
            rules[key] = overlay[key]
    # Also try live Node config if available
    try:
        import subprocess

        out = subprocess.check_output(
            [
                "node",
                "-e",
                "const {loadAnnouncementConfig}=require('/opt/zasya/railway/edge/announce/config');"
                "process.stdout.write(JSON.stringify(loadAnnouncementConfig('BG')));",
            ],
            text=True,
            timeout=10,
        )
        cfg = json.loads(out)
        for key in ("arrival", "delay", "departure", "platformChange", "staleNtes", "languageOrder", "enabledTypes"):
            if key in cfg and cfg[key] is not None:
                rules[key] = cfg[key]
    except Exception:
        pass
    return rules


def parse_iso(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        d = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return d.astimezone(IST)
    except Exception:
        return None


def minutes_spoken(transcript: str | None) -> int | None:
    if not transcript:
        return None
    m = re.search(r"\bin\s+(\w+(?:\s+\w+)?)\s+minutes?\b", transcript, re.I)
    if not m:
        m = re.search(r"(\d+)\s+minutes?", transcript, re.I)
        if m:
            return int(m.group(1))
        return None
    words = m.group(1).lower().strip()
    CARD = {
        "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
        "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
        "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14,
        "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18,
        "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40,
        "fifty": 50, "sixty": 60,
    }
    if words in CARD:
        return CARD[words]
    parts = words.split()
    if len(parts) == 2 and parts[0] in CARD and parts[1] in CARD:
        return CARD[parts[0]] + CARD[parts[1]]
    return None


def expected_interval(mins_to_sta: int | None, rules: dict) -> int | None:
    if mins_to_sta is None:
        return None
    for window in rules.get("arrival", {}).get("windows") or []:
        hi = int(window.get("fromMinutes", 0))
        lo = int(window.get("toMinutes", 0))
        interval = int(window.get("intervalMinutes", 0))
        if lo == 0 and 0 <= mins_to_sta <= hi:
            return interval
        if lo < mins_to_sta <= hi:
            return interval
    return None


def append_jsonl(path: Path, row: dict) -> None:
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def collect() -> dict:
    ensure_dirs()
    state = load_json(STATE, {"seenIds": []}) or {"seenIds": []}
    seen = set(state.get("seenIds") or [])
    hist = load_json(HISTORY, {}) or {}
    events = hist.get("events") or []
    added = 0
    for e in events:
        eid = e.get("id")
        if not eid or eid in seen:
            continue
        row = {
            "collectedAt": now_ist().isoformat(),
            "id": eid,
            "at": e.get("at"),
            "type": e.get("type"),
            "trainNo": e.get("trainNo"),
            "source": e.get("source") or e.get("mode"),
            "ok": e.get("ok"),
            "error": e.get("error"),
            "languages": e.get("languages"),
            "transcript": e.get("transcript"),
            "spokenMinutes": minutes_spoken(e.get("transcript")),
            "wavCount": len(e.get("wavs") or []),
        }
        append_jsonl(EVENTS, row)
        seen.add(eid)
        added += 1
    # Keep seen set bounded
    state["seenIds"] = list(seen)[-5000:]
    state["lastCollectAt"] = now_ist().isoformat()
    STATE.write_text(json.dumps(state, indent=2), encoding="utf-8")

    ntes = load_json(NTES, {}) or {}
    trains = []
    for t in ntes.get("trains") or []:
        trains.append(
            {
                "trainNo": t.get("trainNo"),
                "trainName": t.get("trainName"),
                "platform": t.get("platform"),
                "scheduledArrival": t.get("scheduledArrival"),
                "scheduledDeparture": t.get("scheduledDeparture"),
                "expectedArrival": t.get("expectedArrival"),
                "delay": t.get("delay"),
                "runningState": t.get("runningState"),
                "status": t.get("status"),
            }
        )
    append_jsonl(
        NTES_LOG,
        {
            "at": now_ist().isoformat(),
            "fetchedAt": ntes.get("fetchedAt") or ntes.get("updatedAt"),
            "trainCount": len(trains),
            "trains": trains,
        },
    )
    return {"added": added, "seen": len(seen), "trains": len(trains)}


def load_events_jsonl() -> list[dict]:
    if not EVENTS.exists():
        return []
    rows = []
    for line in EVENTS.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except Exception:
            continue
    return rows


def load_latest_ntes_map() -> dict[str, dict]:
    if not NTES_LOG.exists():
        ntes = load_json(NTES, {}) or {}
        return {str(t.get("trainNo")): t for t in (ntes.get("trains") or []) if t.get("trainNo")}
    last = None
    for line in NTES_LOG.read_text(encoding="utf-8").splitlines():
        if line.strip():
            try:
                last = json.loads(line)
            except Exception:
                pass
    if not last:
        return {}
    return {str(t.get("trainNo")): t for t in (last.get("trains") or []) if t.get("trainNo")}


def review_window(start: datetime, end: datetime, rules: dict) -> dict:
    rows = load_events_jsonl()
    in_window = []
    for r in rows:
        at = parse_iso(r.get("at"))
        if at is None:
            continue
        if start <= at < end:
            in_window.append({**r, "_at": at})
    in_window.sort(key=lambda r: r["_at"])

    findings: list[dict] = []
    by_train: dict[str, list[dict]] = {}
    for r in in_window:
        by_train.setdefault(str(r.get("trainNo") or "?"), []).append(r)

    arr_start = int(rules.get("arrival", {}).get("startMinutes") or 30)
    delay_min = int(rules.get("delay", {}).get("minMinutes") or 15)
    delay_mode = rules.get("delay", {}).get("mode") or "first_only"
    dep_before = int(rules.get("departure", {}).get("minutesBefore") or 10)

    for train_no, plays in by_train.items():
        auto_arr = [p for p in plays if p.get("source") == "auto" and p.get("type") == "arriving"]
        auto_delay = [p for p in plays if p.get("source") == "auto" and p.get("type") == "delayed"]
        auto_dep = [p for p in plays if p.get("source") == "auto" and p.get("type") == "departing"]
        manual = [p for p in plays if p.get("source") == "manual"]

        # Arrival cadence checks
        prev = None
        for p in auto_arr:
            spoken = p.get("spokenMinutes")
            interval = expected_interval(spoken, rules)
            ok_window = spoken is not None and 0 <= spoken <= arr_start
            note = []
            if spoken is None:
                note.append("could not parse spoken minutes from transcript")
            elif not ok_window:
                note.append(f"spoken {spoken}m outside start window 0–{arr_start}m")
            else:
                note.append(f"spoken {spoken}m → expected interval {interval}m")

            if prev is not None and spoken is not None and interval is not None:
                gap = (p["_at"] - prev["_at"]).total_seconds() / 60.0
                # allow ±1.5 min tolerance for poll/queue lag
                if gap + 0.05 < interval - 1.5:
                    findings.append(
                        {
                            "severity": "warn",
                            "trainNo": train_no,
                            "rule": "arrival_interval",
                            "detail": (
                                f"auto arriving gap {gap:.1f}m < expected ~{interval}m "
                                f"(at spoken {spoken}m to STA)"
                            ),
                            "at": p.get("at"),
                            "id": p.get("id"),
                        }
                    )
                elif gap > interval + 4:
                    findings.append(
                        {
                            "severity": "info",
                            "trainNo": train_no,
                            "rule": "arrival_interval",
                            "detail": (
                                f"auto arriving gap {gap:.1f}m > expected ~{interval}m "
                                f"(may be queue/busy or NTES gap)"
                            ),
                            "at": p.get("at"),
                            "id": p.get("id"),
                        }
                    )
                else:
                    findings.append(
                        {
                            "severity": "ok",
                            "trainNo": train_no,
                            "rule": "arrival_interval",
                            "detail": f"gap {gap:.1f}m ≈ interval {interval}m ({'; '.join(note)})",
                            "at": p.get("at"),
                            "id": p.get("id"),
                        }
                    )
            else:
                findings.append(
                    {
                        "severity": "ok" if ok_window else "warn",
                        "trainNo": train_no,
                        "rule": "arrival_window",
                        "detail": "; ".join(note) or "first auto arriving in hour",
                        "at": p.get("at"),
                        "id": p.get("id"),
                    }
                )
            if p.get("error"):
                findings.append(
                    {
                        "severity": "error",
                        "trainNo": train_no,
                        "rule": "playback",
                        "detail": f"playback error: {p.get('error')}",
                        "at": p.get("at"),
                        "id": p.get("id"),
                    }
                )
            langs = p.get("languages") or []
            if langs and langs != rules.get("languageOrder"):
                findings.append(
                    {
                        "severity": "warn",
                        "trainNo": train_no,
                        "rule": "language_order",
                        "detail": f"languages {langs} != configured {rules.get('languageOrder')}",
                        "at": p.get("at"),
                        "id": p.get("id"),
                    }
                )
            prev = p

        # Delay: first_only → at most one auto delayed in window (approx)
        if delay_mode == "first_only" and len(auto_delay) > 1:
            findings.append(
                {
                    "severity": "warn",
                    "trainNo": train_no,
                    "rule": "delay_first_only",
                    "detail": f"{len(auto_delay)} auto delayed plays (rule: first_only, min {delay_min}m)",
                    "at": auto_delay[-1].get("at"),
                    "id": auto_delay[-1].get("id"),
                }
            )
        for p in auto_delay:
            findings.append(
                {
                    "severity": "ok",
                    "trainNo": train_no,
                    "rule": "delay",
                    "detail": f"auto delayed (rule min {delay_min}m, mode {delay_mode})",
                    "at": p.get("at"),
                    "id": p.get("id"),
                }
            )

        for p in auto_dep:
            findings.append(
                {
                    "severity": "ok",
                    "trainNo": train_no,
                    "rule": "departure",
                    "detail": f"auto departing (rule: within {dep_before}m of STD, repeat={rules.get('departure', {}).get('repeat')})",
                    "at": p.get("at"),
                    "id": p.get("id"),
                }
            )

        if manual:
            findings.append(
                {
                    "severity": "info",
                    "trainNo": train_no,
                    "rule": "manual",
                    "detail": f"{len(manual)} manual play(s) (not scored against auto cadence)",
                    "at": manual[-1].get("at"),
                    "id": manual[-1].get("id"),
                }
            )

    # Language completeness for auto plays
    for r in in_window:
        if r.get("source") != "auto":
            continue
        wc = int(r.get("wavCount") or 0)
        expect = len(rules.get("languageOrder") or ["te", "en", "hi"])
        if wc and wc < expect:
            findings.append(
                {
                    "severity": "warn",
                    "trainNo": r.get("trainNo"),
                    "rule": "languages_complete",
                    "detail": f"only {wc}/{expect} language wavs",
                    "at": r.get("at"),
                    "id": r.get("id"),
                }
            )

    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "plays": len(in_window),
        "auto": sum(1 for r in in_window if r.get("source") == "auto"),
        "manual": sum(1 for r in in_window if r.get("source") == "manual"),
        "trains": sorted(by_train.keys()),
        "playsDetail": [
            {
                "at": r.get("at"),
                "id": r.get("id"),
                "type": r.get("type"),
                "trainNo": r.get("trainNo"),
                "source": r.get("source"),
                "spokenMinutes": r.get("spokenMinutes"),
                "ok": r.get("ok"),
                "error": r.get("error"),
                "transcript": (r.get("transcript") or "")[:160],
            }
            for r in in_window
        ],
        "findings": findings,
        "rulesSnapshot": {
            "arrival": rules.get("arrival"),
            "delay": rules.get("delay"),
            "departure": rules.get("departure"),
            "languageOrder": rules.get("languageOrder"),
        },
        "boardSample": load_latest_ntes_map(),
    }


def write_hourly_report(review: dict) -> Path:
    ensure_dirs()
    start = parse_iso(review["start"]) or now_ist()
    name = start.strftime("%Y-%m-%d_%H00IST.md")
    path = HOURLY / name
    counts = {"ok": 0, "warn": 0, "error": 0, "info": 0}
    for f in review.get("findings") or []:
        counts[f.get("severity", "info")] = counts.get(f.get("severity", "info"), 0) + 1

    lines = [
        f"# Announce monitor — hourly review",
        f"",
        f"- Window (IST): `{review['start']}` → `{review['end']}`",
        f"- Plays: **{review['plays']}** (auto {review['auto']}, manual {review['manual']})",
        f"- Trains: {', '.join(review.get('trains') or []) or '—'}",
        f"- Findings: ok={counts.get('ok',0)} warn={counts.get('warn',0)} error={counts.get('error',0)} info={counts.get('info',0)}",
        f"",
        f"## Configured rules (snapshot)",
        f"```json",
        json.dumps(review.get("rulesSnapshot"), indent=2),
        f"```",
        f"",
        f"## Plays in this hour",
        f"",
    ]
    if not review.get("playsDetail"):
        lines.append("_No announcement plays recorded in this hour._")
    else:
        lines.append("| IST time | Train | Type | Source | Spoken min | OK |")
        lines.append("|---|---|---|---|---:|:---:|")
        for p in review["playsDetail"]:
            at = parse_iso(p.get("at"))
            t = at.strftime("%H:%M:%S") if at else "?"
            lines.append(
                f"| {t} | {p.get('trainNo')} | {p.get('type')} | {p.get('source')} | "
                f"{p.get('spokenMinutes') if p.get('spokenMinutes') is not None else '—'} | "
                f"{'yes' if p.get('ok') else 'no'} |"
            )
        lines.append("")
        lines.append("### Transcripts (english)")
        for p in review["playsDetail"]:
            if p.get("transcript"):
                lines.append(f"- `{p.get('trainNo')}` {p.get('type')}: {p.get('transcript')}")

    lines += ["", "## Rule comparison findings", ""]
    if not review.get("findings"):
        lines.append("_No findings (no plays to score)._")
    else:
        for f in review["findings"]:
            lines.append(
                f"- **{f.get('severity')}** `{f.get('trainNo')}` / {f.get('rule')}: {f.get('detail')} "
                f"({f.get('at')})"
            )

    lines += [
        "",
        "## Board sample at review time",
        "```json",
        json.dumps(review.get("boardSample") or {}, indent=2)[:4000],
        "```",
        "",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    # Also write machine-readable
    (HOURLY / start.strftime("%Y-%m-%d_%H00IST.json")).write_text(
        json.dumps(review, indent=2, default=str), encoding="utf-8"
    )
    return path


def hourly() -> Path:
    ensure_dirs()
    collect()  # ensure freshest events
    rules = load_rules()
    end = now_ist().replace(minute=0, second=0, microsecond=0)
    # If run exactly on the hour, review the previous hour
    if now_ist().minute < 2:
        end = end
    start = end - timedelta(hours=1)
    # If first run mid-hour, still review last full hour
    review = review_window(start, end, rules)
    path = write_hourly_report(review)
    return path


def summarize() -> Path:
    ensure_dirs()
    reports = sorted(HOURLY.glob("*IST.json"))
    lines = [
        "# Announce monitor — period summary",
        f"",
        f"- Generated: `{now_ist().isoformat()}`",
        f"- Hourly reports: {len(reports)}",
        f"- Event log: `{EVENTS}` ({EVENTS.stat().st_size if EVENTS.exists() else 0} bytes)",
        f"",
    ]
    total_plays = 0
    total_warn = 0
    total_err = 0
    for rp in reports:
        data = load_json(rp, {}) or {}
        total_plays += int(data.get("plays") or 0)
        for f in data.get("findings") or []:
            if f.get("severity") == "warn":
                total_warn += 1
            if f.get("severity") == "error":
                total_err += 1
        lines.append(
            f"- `{rp.name}`: plays={data.get('plays')} auto={data.get('auto')} "
            f"manual={data.get('manual')} trains={','.join(data.get('trains') or [])}"
        )
    lines += [
        "",
        f"**Totals:** plays={total_plays}, warn findings={total_warn}, error findings={total_err}",
        "",
        "## Rules reminder",
        "- Arrival (STA): 30–15 every **3** min; 15–0 every **5** min",
        "- Delay: announce when delay ≥ **15** min (`first_only`)",
        "- Departure: once within **10** min of STD",
        "- Languages: te → en → hi",
        "",
    ]
    SUMMARY.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return SUMMARY


def main() -> None:
    ap = argparse.ArgumentParser(description="Zasya announce cadence monitor")
    ap.add_argument("mode", choices=["collect", "hourly", "summarize", "status"])
    args = ap.parse_args()
    ensure_dirs()
    if args.mode == "collect":
        result = collect()
        print(json.dumps({"ok": True, "mode": "collect", **result}))
    elif args.mode == "hourly":
        path = hourly()
        print(json.dumps({"ok": True, "mode": "hourly", "report": str(path)}))
    elif args.mode == "summarize":
        path = summarize()
        print(json.dumps({"ok": True, "mode": "summarize", "report": str(path)}))
    else:
        rules = load_rules()
        print(
            json.dumps(
                {
                    "ok": True,
                    "dir": str(ROOT),
                    "events": EVENTS.exists(),
                    "eventBytes": EVENTS.stat().st_size if EVENTS.exists() else 0,
                    "hourlyReports": len(list(HOURLY.glob("*.md"))),
                    "rules": {
                        "arrival": rules.get("arrival"),
                        "delay": rules.get("delay"),
                        "departure": rules.get("departure"),
                    },
                },
                indent=2,
            )
        )


if __name__ == "__main__":
    main()
