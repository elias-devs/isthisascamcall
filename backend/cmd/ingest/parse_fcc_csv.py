import argparse
from datetime import datetime, timezone
from dotenv import load_dotenv
import os
import re
from typing import List

import pandas as pd
import phonenumbers
import psycopg2
from psycopg2.extras import execute_values

from utils import PhoneReport, PhoneNumber

PARSE_FCC_DESCRIPTION = """
This script parses FCC Consumer Complaints data:
https://opendata.fcc.gov/Consumer/Consumer-Complaints-Data-Unwanted-Calls/vakf-fz8e/about_data

You can pass the following arguments:
    --csv=/path/to/fccdata.csv      # Mandatory path to data
    --env=/path/to/postgredb.env    # Mandatory, if uploading to postgre
    --push-to-db=True               # Optional, to push to postgre
    --debug=True                    # Turn on verbose printing, by default only errors printed 
"""


def debug(msg):
    if args.debug:
        print(msg)


def convert_date_time_to_dt(date_val: str, time_val: str) -> datetime | None:
    if any(not isinstance(val, str) or not val for val in [date_val, time_val]):
        debug(f"Bad date/time val(s): {date_val} {time_val}")
        return None
    normalized_time = time_val.replace(".", "").replace(",","").upper()
    dt_str = f"{date_val} {normalized_time}"
    try:
        return datetime.strptime(dt_str, "%m/%d/%Y %I:%M %p").replace(tzinfo=timezone.utc)
    except Exception:
        print(f'Unable to parse datetime: {dt_str} ({date_val}, {time_val})')
        return None


def get_row_value(raw_value, column):
    """Basic parsing for raw_value given a column name."""
    if not isinstance(raw_value, str):
        if column == "Location (Center point of the Zip Code)":
            return None, None
        else:
            return None

    if column in ["Caller ID Number", "Advertiser Business Number"]:
        try:
            return phonenumbers.parse(raw_value, "US") if raw_value else None
        except Exception as er:
            print(f"Unable to parse #: {raw_value}: {er}")
            return ""
    elif column == "Location (Center point of the Zip Code)":
        try:
            return tuple(map(float, re.sub(r"[^\d\s-]", "", raw_value).split())) if raw_value else None, None
        except Exception:
            print(f"Unable to parse location : {raw_value}")
            return None, None
    elif column in ["Ticket_ID", "Issue", "Type of Call or Messge", "Method", "Subject"]:
        try:
            return raw_value.strip()
        except Exception:
            if raw_value:
                print(f"Unable to parse {column}: {raw_value}")
            return None
    elif column == "State":
        if not (raw_value.isupper() and len(raw_value.strip()) == 2):
            if raw_value:
                print(f"Unrecognized state format: {raw_value}")
            return None
        return raw_value.strip()
    elif column == "Zip":
        if not re.match(r"[\d-]", raw_value.strip()):
            print(f"Unrecognized zip format: {raw_value}")
            return None
        return raw_value.strip()


def parse_fcc_csv(csv_file_path: str) -> tuple[list[PhoneReport], List[PhoneNumber]]:
    reports : list[PhoneReport] = []
    numbers : list[PhoneNumber] = []
    seen_numbers = set()
    seen_reports = set()

    df = pd.read_csv(
        csv_file_path,
        delimiter=",",
        quotechar='"',
        skipinitialspace=True,
        header=0
    )
    df = df.fillna("")
    
    print("Read .csv, parsing...")
    df = df.rename(columns={
        "Ticket ID": "Ticket_ID",
        "Date of Issue": "Date_of_Issue",
        "Time of Issue": "Time_of_Issue",
        "Caller ID Number": "Caller_ID_Number",
        "Type of Call or Messge": "Type_of_Call",
        "Advertiser Business Number": "Advertiser_Business_Number",
        "Location (Center point of the Zip Code)": "Location_Center_Zip",
    })
    for row in df.itertuples(index=False, name="Row"):
        row = row._asdict()
        phone_number = get_row_value(row.get("Caller_ID_Number"), "Caller ID Number")
        if not phone_number:
            continue    # skip rows with no phone #
        phone_number_str = f"+{phone_number.country_code}{phone_number.national_number}"
        try:
            latitude, longitude = get_row_value(
                row.get("Location_Center_Zip"),
                "Location (Center point of the Zip Code)"
            )
        except Exception:
            print(f"Failed to parse long/latitude: {row}")
            latitude, longitude = None, None
        else:
            if latitude and not longitude:
                import pdb;pdb.set_trace()
        # Parse Date of Issue
        report_date = convert_date_time_to_dt(
            row.get("Date_of_Issue"), row.get("Time_of_Issue")
        )
        method = get_row_value(row.get("Method"), "Method")
        reason = get_row_value(row.get("Type_of_Call"), "Type of Call or Messge")
        subject = get_row_value(row.get("Issue"), "Issue")
        state = get_row_value(row.get("State"), "State")
        zipcode = get_row_value(row.get("Zip"), "Zip")
        ticket_id = get_row_value(str(row.get("Ticket_ID")), "Ticket_ID")

        if ticket_id not in seen_reports:
            seen_reports.add(ticket_id)
        else:
            print(f"Found duplicate report ID {ticket_id}")
            if phone_number_str not in seen_numbers:
                print(f"Error: found duplicate ticket ID {ticket_id}, but missing {phone_number_str} in lists")
                print(f"Error: Bad data, skipping this row...")
            continue
        try:
            #import pdb;pdb.set_trace()
	    # Build the PhoneReport
            report = PhoneReport(
                phone_number=phone_number_str,
                source="FCC",
                report_date=report_date,
                violation_date=None,  # FCC doesn't provide separate violation date
                report_method=method or None,
                type_of_call=reason or None,
                subject=subject or None,
                consumer_city=None,  # FCC file does not have city — just state/zip
                consumer_state=state,
                consumer_zip=zipcode,
                notes=None,
                latitude=latitude,
                longitude=longitude,
                source_seq_id=str(ticket_id)
            )
            debug(f"Saving report: {report}")
            reports.append(report)
        except Exception as e:
            print(f"Failed to parse row {ticket_id}: {e}")
            continue
        if phone_number_str not in seen_numbers:
            seen_numbers.add(phone_number_str)
            number = PhoneNumber(
                phone_number=phone_number_str,
                country_code=phone_number.country_code,
            )
            debug(f"Saving number: {number}")
            numbers.append(number)

    return reports, numbers


def insert_phone_reports(conn, phone_reports: List[PhoneReport]):
    if not phone_reports:
        return
    with conn.cursor() as cur:
        debug("Attempting to save values to sql: ")
        execute_values(
            cur,
            """
            INSERT INTO phone_reports (
                phone_number, source, report_date, violation_date,
                report_method, type_of_call, subject, robocall,
                consumer_city, consumer_state, consumer_zip,
                latitude, longitude, source_seq_id, notes, created_at
            ) VALUES %s
            ON CONFLICT DO NOTHING
            """,
            [(
                r.phone_number, r.source, r.report_date, r.violation_date,
                r.report_method, r.type_of_call, r.subject, r.robocall,
                r.consumer_city, r.consumer_state, r.consumer_zip,
                r.latitude, r.longitude, r.source_seq_id, r.notes, r.created_at
            ) for r in phone_reports]
        )


def insert_phone_numbers(conn, phone_numbers: List[PhoneNumber]):
    if not phone_numbers:
        return
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO phone_numbers (
                phone_number, country_code
            ) VALUES %s
            ON CONFLICT (phone_number) DO NOTHING
            """,
            [(n.phone_number, str(n.country_code)) for n in phone_numbers]
        )


if __name__ == '__main__':
    argp = argparse.ArgumentParser(description=PARSE_FCC_DESCRIPTION)
    argp.add_argument("--csv", dest="csv", default="./data/FCCData.csv")
    argp.add_argument(
        "--env",
        dest="env",
        default="./data/db.env",
        help="Mandatory, if uploading to postgre"
    )
    argp.add_argument(
        "--push-to-db",
        dest="push_to_db",
        default=False,
        action="store_true",
        help="Optional, to push to postgre"
    )
    argp.add_argument(
        "--debug",
        dest="debug",
        default=False,
        action="store_true",
        help="Turn on verbose printing, by default only errors printed"
    )
    argp.add_argument(
        "--confirm",
        dest="confirm",
        default=True,
        action="store_false",
        help="Adds a manual step before pushing to the database."
    )

    args = argp.parse_args()
    if not os.path.isfile(args.csv) or not args.csv.endswith(".csv"):
        raise FileNotFoundError("A path to FCC .csv data is needed for this script to run.")
    if args.push_to_db and not os.path.isfile(args.env):
        raise FileNotFoundError("A path to a .env with database information is needed to push to the DB.")

    phone_reports, phone_numbers = parse_fcc_csv(args.csv)
    
    print(f"Found {len(phone_reports)} reports for {len(phone_numbers)} unique numbers.")

    if args.confirm:
        input("Press enter to push database now...")

    load_dotenv(args.env)

    db_client = psycopg2.connect(
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT")
    )
    db_client.autocommit = False

    try:
        insert_phone_numbers(db_client, phone_numbers)
        insert_phone_reports(db_client, phone_reports)
        db_client.commit()
        print(f"# Inserted {len(phone_numbers)} numbers and {len(phone_reports)} reports")
    except Exception as e:
        db_client.rollback()
        print(f"Error during insert: {e}")
    finally:
        db_client.close()
