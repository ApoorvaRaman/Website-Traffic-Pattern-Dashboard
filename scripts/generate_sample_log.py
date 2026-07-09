#!/usr/bin/env python3
"""
generate_sample_log.py

Generates a synthetic Apache/NCSA Common Log Format access log that mimics
the traffic *shape* of the real NASA-HTTP (1995) and Kaggle Apache logs
datasets: busier on weekdays, busier during business hours, with a realistic
mix of resources and status codes.

This is ONLY used to ship a working demo inside the repo (real 1995 NASA
logs / Kaggle logs are ~20-200MB and aren't bundled here). Point
parse_logs.py at a real downloaded log file to replace this data.
"""
import random
from datetime import datetime, timedelta

random.seed(42)

HOSTS = [f"host{i}.example.com" for i in range(1, 60)] + [
    f"{random.randint(100,220)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}"
    for _ in range(80)
]

PATHS = (
    ["/images/NASA-logosmall.gif"] * 20
    + ["/images/KSC-logosmall.gif"] * 12
    + ["/history/apollo/apollo-11/apollo-11.html"] * 10
    + ["/history/apollo/images/apollo-11-launch.gif"] * 8
    + ["/shuttle/countdown/", "/shuttle/countdown/count.gif"] * 9
    + ["/shuttle/missions/sts-71/sts-71-patch-small.gif"] * 6
    + ["/software/winvn/winvn.html", "/software/winvn/wvsmall.gif"] * 5
    + ["/facts/about_ksc.html", "/htbin/cdt_main.pl", "/robots.txt", "/"] * 4
)

STATUS_WEIGHTS = [(200, 82), (304, 10), (302, 3), (404, 4), (500, 1)]


def weighted_status():
    r = random.uniform(0, 100)
    acc = 0
    for code, w in STATUS_WEIGHTS:
        acc += w
        if r <= acc:
            return code
    return 200


def hour_weight(hour, weekday):
    # Business-hours bias, lighter on weekends (5=Sat,6=Sun)
    base = 1.0
    if 9 <= hour <= 17:
        base = 4.0
    elif 7 <= hour < 9 or 17 < hour <= 21:
        base = 2.2
    else:
        base = 0.6
    if weekday >= 5:  # weekend dampening
        base *= 0.45
    return base


def build_weighted_hours(weekday):
    weights = [hour_weight(h, weekday) for h in range(24)]
    total = sum(weights)
    return [w / total for w in weights]


def main(out_path="data/sample_access.log", days=21, avg_requests_per_day=650):
    start_date = datetime(1995, 7, 1)  # nod to the real NASA-HTTP log period
    lines = []
    for d in range(days):
        day = start_date + timedelta(days=d)
        weekday = day.weekday()
        weekend_factor = 0.45 if weekday >= 5 else 1.0
        n_requests = int(random.gauss(avg_requests_per_day * weekend_factor, avg_requests_per_day * 0.12))
        n_requests = max(50, n_requests)
        hour_probs = build_weighted_hours(weekday)
        for _ in range(n_requests):
            hour = random.choices(range(24), weights=hour_probs, k=1)[0]
            minute = random.randint(0, 59)
            second = random.randint(0, 59)
            ts = day.replace(hour=hour, minute=minute, second=second)
            host = random.choice(HOSTS)
            path = random.choice(PATHS)
            status = weighted_status()
            size = random.choice([0, 96, 234, 786, 1024, 2048, 4096, 8192, 15360])
            method = "GET"
            protocol = "HTTP/1.0"
            ts_str = ts.strftime("%d/%b/%Y:%H:%M:%S -0400")
            line = f'{host} - - [{ts_str}] "{method} {path} {protocol}" {status} {size}'
            lines.append((ts, line))

    lines.sort(key=lambda x: x[0])
    with open(out_path, "w") as f:
        f.write("\n".join(l for _, l in lines) + "\n")
    print(f"Wrote {len(lines)} log lines to {out_path}")


if __name__ == "__main__":
    main(out_path="data/sample_access.log", days=7, avg_requests_per_day=300)  
