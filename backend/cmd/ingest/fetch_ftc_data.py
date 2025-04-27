import argparse
import json
import os
import requests
from datetime import datetime, timedelta

# === Config ===
FTC_ENDPOINT = "https://api.ftc.gov/v0/dnc-complaints"
FTC_API_KEY = os.getenv("FTC_API_KEY")
PAGE_LIMIT = 50

if not FTC_API_KEY:
    print("ERROR: FTC_API_KEY environment variable is missing.")
    exit(1)

# === Normalize function ===
def normalize(record):
    attr = record.get("attributes", {})

    try:
        report_date = datetime.strptime(attr["created-date"], "%Y-%m-%d %H:%M:%S")
    except (KeyError, ValueError) as e:
        raise ValueError(f"Invalid created-date: {e}")

    violation_date = None
    violation_raw = attr.get("violation-date")
    if violation_raw:
        try:
            violation_date = datetime.strptime(violation_raw, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            violation_date = None  # Skip bad formats

    return {
        "phone_number": attr.get("company-phone-number", ""),
        "source": "FTC",
        "report_date": report_date.isoformat(),
        "violation_date": violation_date.isoformat() if violation_date else None,
        "subject": attr.get("subject", ""),
        "robocall": attr.get("recorded-message-or-robocall", "") == "Y",
        "consumer_city": attr.get("consumer-city", ""),
        "consumer_state": attr.get("consumer-state", ""),
        "consumer_area_code": attr.get("consumer-area-code", ""),
    }

# === Main ===
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("-range", default="day", help="Range to fetch: day, week, all")
    parser.add_argument("-output", default=None, help="Optional output file (JSON)")
    args = parser.parse_args()

    # Time window
    end = datetime.utcnow()
    if args.range == "day":
        start = end - timedelta(days=1)
    elif args.range == "week":
        start = end - timedelta(weeks=1)
    elif args.range == "all":
        start = datetime(2015, 1, 1)
    else:
        print("Invalid range: must be 'day', 'week', or 'all'")
        exit(1)

    all_reports = []
    offset = 0

    while True:
        from_str = start.strftime("%Y-%m-%d %H:%M:%S")
        to_str = end.strftime("%Y-%m-%d %H:%M:%S")

        url = (
            f"{FTC_ENDPOINT}?api_key={FTC_API_KEY}"
            f"&created_date_from={from_str}&created_date_to={to_str}"
            f"&page[limit]={PAGE_LIMIT}&page[offset]={offset}"
        )

        try:
            resp = requests.get(url)
            resp.raise_for_status()
        except requests.RequestException as e:
            print(f"Request error: {e}")
            break

        try:
            result = resp.json()
        except ValueError as e:
            print(f"JSON decode error: {e}")
            break

        data = result.get("data", [])
        if not data:
            break

        for record in data:
            try:
                normalized = normalize(record)
                all_reports.append(normalized)
            except Exception as e:
                print(f"Error normalizing record: {e}")

        if result.get("meta", {}).get("records-this-page", 0) < PAGE_LIMIT:
            break

        offset += PAGE_LIMIT

    # Output
    if args.output:
        try:
            with open(args.output, "w", encoding="utf-8") as f:
                json.dump(all_reports, f, indent=2)
            print(f"# Wrote {len(all_reports)} records to {args.output}")
        except IOError as e:
            print(f"Error writing file: {e}")
            exit(1)
    else:
        print(json.dumps(all_reports, indent=2))


if __name__ == "__main__":
    main()
