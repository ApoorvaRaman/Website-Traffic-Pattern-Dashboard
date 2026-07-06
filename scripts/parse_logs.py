#!/usr/bin/env python3
"""
parse_logs.py

Parses NCSA Common / Combined Log Format access logs -- the format used by
both the NASA-HTTP (1995) dataset and the Kaggle "Apache Web Server Logs"
dataset -- and produces a single compact JSON file the dashboard front-end
can fetch, with no server / database required.

Usage:
    python3 scripts/parse_logs.py data/sample_access.log -o data/data.json
    python3 scripts/parse_logs.py data/NASA_access_log_Jul95 -o data/data.json --source "NASA-HTTP Jul 1995"

Works on files of any size in O(1) memory (streamed line by line), so it's
fine to point it at the full multi-hundred-MB NASA or Kaggle log dumps.
"""
import argparse
import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone

# Matches NCSA Common / Combined Log Format:
#   host ident authuser [date] "request" status bytes ["referrer" "agent"]
LOG_PATTERN = re.compile(
    r'^(?P<host>\S+) \S+ \S+ \[(?P<datetime>[^\]]+)\] '
    r'"(?P<request>[^"]*)" (?P<status>\d{3}|-) (?P<size>\S+)'
)

WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# A handful of timestamp formats seen across NASA / Apache / Kaggle log dumps
DATE_FORMATS = [
    "%d/%b/%Y:%H:%M:%S %z",
    "%d/%b/%Y:%H:%M:%S",
]


def parse_datetime(raw):
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    return None


def parse_log_file(path):
    hourly = Counter()
    weekday = Counter()
    heatmap = [[0] * 24 for _ in range(7)]  # [weekday][hour]
    status_codes = Counter()
    top_paths = Counter()
    daily_totals = Counter()  # date string -> count, used for min/max/date range
    total = 0
    malformed = 0
    min_dt, max_dt = None, None

    with open(path, "r", errors="replace") as f:
        for line in f:
            m = LOG_PATTERN.match(line)
            if not m:
                malformed += 1
                continue
            dt = parse_datetime(m.group("datetime"))
            if dt is None:
                malformed += 1
                continue

            total += 1
            hour = dt.hour
            wd = dt.weekday()  # 0=Monday
            hourly[hour] += 1
            weekday[wd] += 1
            heatmap[wd][hour] += 1
            status_codes[m.group("status")] += 1
            daily_totals[dt.strftime("%Y-%m-%d")] += 1

            request = m.group("request")
            parts = request.split()
            if len(parts) >= 2:
                top_paths[parts[1]] += 1

            if min_dt is None or dt.replace(tzinfo=None) < min_dt:
                min_dt = dt.replace(tzinfo=None)
            if max_dt is None or dt.replace(tzinfo=None) > max_dt:
                max_dt = dt.replace(tzinfo=None)

    return {
        "total": total,
        "malformed": malformed,
        "hourly": hourly,
        "weekday": weekday,
        "heatmap": heatmap,
        "status_codes": status_codes,
        "top_paths": top_paths,
        "daily_totals": daily_totals,
        "min_dt": min_dt,
        "max_dt": max_dt,
    }


def build_output(stats, source_label):
    hourly_list = [stats["hourly"].get(h, 0) for h in range(24)]
    weekday_list = [stats["weekday"].get(d, 0) for d in range(7)]

    peak_hour = max(range(24), key=lambda h: hourly_list[h]) if stats["total"] else 0
    peak_day_idx = max(range(7), key=lambda d: weekday_list[d]) if stats["total"] else 0

    busiest_date, busiest_date_count = (None, 0)
    if stats["daily_totals"]:
        busiest_date, busiest_date_count = max(stats["daily_totals"].items(), key=lambda kv: kv[1])

    avg_per_day = round(stats["total"] / max(1, len(stats["daily_totals"])), 1)

    return {
        "meta": {
            "source": source_label,
            "total_requests": stats["total"],
            "malformed_lines_skipped": stats["malformed"],
            "date_range": {
                "start": stats["min_dt"].isoformat() if stats["min_dt"] else None,
                "end": stats["max_dt"].isoformat() if stats["max_dt"] else None,
            },
            "days_covered": len(stats["daily_totals"]),
            "avg_requests_per_day": avg_per_day,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
        "hourly": hourly_list,
        "weekday": weekday_list,
        "weekday_labels": WEEKDAY_NAMES,
        "heatmap": stats["heatmap"],
        "peak": {
            "hour": peak_hour,
            "hour_label": f"{peak_hour:02d}:00-{(peak_hour+1)%24:02d}:00",
            "day": WEEKDAY_NAMES[peak_day_idx],
            "busiest_date": busiest_date,
            "busiest_date_count": busiest_date_count,
        },
        "status_codes": dict(stats["status_codes"].most_common()),
        "top_paths": [{"path": p, "count": c} for p, c in stats["top_paths"].most_common(10)],
    }


def main():
    ap = argparse.ArgumentParser(description="Parse Apache/NASA access logs into dashboard JSON")
    ap.add_argument("logfile", help="Path to the raw access log file")
    ap.add_argument("-o", "--output", default="data/data.json", help="Output JSON path")
    ap.add_argument("--source", default=None, help="Label describing the dataset (shown in the UI)")
    args = ap.parse_args()

    label = args.source or args.logfile.split("/")[-1]

    try:
        stats = parse_log_file(args.logfile)
    except FileNotFoundError:
        print(f"ERROR: could not find log file: {args.logfile}", file=sys.stderr)
        sys.exit(1)

    if stats["total"] == 0:
        print("WARNING: no valid log lines were parsed. Check the log format.", file=sys.stderr)

    output = build_output(stats, label)

    with open(args.output, "w") as f:
        json.dump(output, f, indent=2)

    print(f"Parsed {stats['total']} requests ({stats['malformed']} malformed lines skipped)")
    print(f"Peak hour: {output['peak']['hour_label']}  |  Peak day: {output['peak']['day']}")
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
