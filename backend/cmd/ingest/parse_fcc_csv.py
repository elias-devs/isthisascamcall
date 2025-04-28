from datetime import datetime
import os
import re
from typing import List
import sys

from dateutil.parser import parse as parse_datetime
import pandas as pd
import phonenumbers

from utils import PhoneReport

VERBOSE = False


def debug(msg):
    if VERBOSE:
        print(msg)


def get_row_value(raw_value, column):
    """Basic parsing for raw_value given value, which can be of the below types:
    - Caller ID Number
    - Location (Center point of the Zip Code)
    - Date of Issue
    - Method
    =
    """
    if not isinstance(raw_value, str):
        if column == "Location (Center point of the Zip Code)":
            return None, None
        else:
            return None

    if column in ["Caller ID Number", "Advertiser Business Number"]:
        try:
            number = phonenumbers.parse(raw_value, "US")
            return f"+{number.country_code}{number.national_number}"
        except Exception as er:
            print(f"Unable to parse #: {raw_value}: {er}")
            return ""
    elif column == "Location (Center point of the Zip Code)":
        try:
            return re.sub(r"[^\d\s-]", "", raw_value).split()
        except Exception as er:
            print(f"Unable to parse location : {raw_value}")
            return None, None
    elif column == "Date of Issue":
        try:
            return parse_datetime(raw_value) if raw_value else None
        except Exception:
            print(f"Unable to parse date: {raw_value}")
        return None
    elif column == "Method":
        try:
            return raw_value.strip()
        except Exception:
            print(f"Unable to parse method {raw_value}")
            return None
    elif column == "Type of Call or Messge":
        try:
            return raw_value.strip()
        except Exception:
            print(f"Unable to parse 'reason' {raw_value}")
            return None
    elif column == "Issue":
        try:
            return raw_value.strip()
        except Exception:
            print(f"Unable to parse 'issue' {raw_value}")
            return None
    elif column == "State":
        if not (raw_value.isupper() and len(raw_value.strip()) == 2):
            print(f"Unrecognized state format: {raw_value}")
            return None
        return raw_value.strip()
    elif column == "Zip":
        if not re.match(r"[\d-]", raw_value.strip()):
            print(f"Unrecognized zip format: {raw_value}")
            return None
        return raw_value.strip()




def parse_fcc_csv(csv_file_path: str) -> List[PhoneReport]:
    reports = []
    df = pd.read_csv(csv_file_path)
    print("Read .csv, parsing...")
    for row in df.itertuples(index=False, name="Row"):

        phone_number = get_row_value(row._asdict().get("Caller ID Number"), "Caller ID Number")
        if not phone_number:
            continue    # skip rows with no phone #

        latitude, longitude = get_row_value(
            row._asdict().get("Location (Center point of the Zip Code)"),
            "Location (Center point of the Zip Code)"
        )

        # Parse Date of Issue
        report_date = get_row_value(row._asdict().get("Date of Issue"), "Date of Issue")

        method = get_row_value(row._asdict().get("Method"), "Method")
        reason = get_row_value(row._asdict().get("Type of Call or Messge"), "Type of Call or Messge")
        subject = get_row_value(row._asdict().get("Issue"), "Issue").strip()
        cons_num = get_row_value(row._asdict().get("Advertiser Business Number"), "Advertiser Business Number")
        state = get_row_value(row._asdict().get("State"), "State")
        zipcode = get_row_value(row._asdict().get("Zip"), "Zip")

        try:
            # Build the PhoneReport
            report = PhoneReport(
                phone_number=phone_number,
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
                created_at=datetime.utcnow(),
                latitude=latitude,
                longitude=longitude
            )
            debug(f"Saving report: {report}")
            reports.append(report)
        except Exception as e:
            print(f"Failed to parse row: {e}")

    return reports


if __name__ == '__main__':
    if not sys.argv:
        raise ValueError("A path to FCC .csv data is needed for this script to run.")
    file = sys.argv[0]
    if not os.path.isfile(file):
        raise ValueError(f"Invalid file {file}")
    parse_fcc_csv(file)
