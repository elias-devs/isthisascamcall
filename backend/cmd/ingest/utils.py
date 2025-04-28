from datetime import datetime
from typing import Optional

from dataclasses import dataclass, field


# === Dataclass ===

# === phone_numbers table ===
@dataclass
class PhoneNumber:
    phone_number: str  # Primary Key
    region: Optional[str] = None
    carrier: Optional[str] = None
    country_code: Optional[str] = None
    first_seen_at: Optional[datetime] = None
    last_reported_at: Optional[datetime] = None
    report_count: int = 0
    scam_score: float = 0.0


# === phone_reports table ===
@dataclass
class PhoneReport:
    phone_number: str  # fmt '+12133211234'
    source: str
    report_date: datetime
    violation_date: Optional[datetime] = None

    report_method: Optional[str] = None
    type_of_call: Optional[str] = None
    subject: Optional[str] = None
    robocall: Optional[bool] = None

    consumer_city: Optional[str] = None
    consumer_state: Optional[str] = None
    consumer_zip: Optional[str] = None

    latitude: Optional[float] = None
    longitude: Optional[float] = None

    source_seq_id: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.utcnow)

    secret_key: Optional[str] = None

    helpful_upvotes: int = 0
    helpful_downvotes: int = 0
