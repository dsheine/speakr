# src/services/outlook_msg.py

from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

import extract_msg  # Paket "extract-msg"


@dataclass
class OutlookEventData:
    subject: str
    starts_at: Optional[datetime]
    ends_at: Optional[datetime]
    location: Optional[str]
    organizer: Optional[str]
    attendees: List[str]
    body: Optional[str]


def parse_outlook_msg(file_obj) -> OutlookEventData:
    msg = extract_msg.Message(file_obj)  # type: ignore[arg-type]

    sender = getattr(msg, "sender", None)
    to_ = getattr(msg, "to", "") or ""
    cc_ = getattr(msg, "cc", "") or ""

    attendees: List[str] = []
    for part in (to_, cc_):
        for addr in part.split(";"):
            addr = addr.strip()
            if addr:
                attendees.append(addr)

    raw_date = getattr(msg, "date", None)
    if isinstance(raw_date, datetime):
        starts_at: Optional[datetime] = raw_date
    else:
        try:
            starts_at = datetime.fromisoformat(str(raw_date)) if raw_date else None
        except Exception:
            starts_at = None

    ends_at: Optional[datetime] = None

    return OutlookEventData(
        subject=getattr(msg, "subject", "") or "",
        starts_at=starts_at,
        ends_at=ends_at,
        location=getattr(msg, "location", None),
        organizer=sender,
        attendees=attendees,
        body=getattr(msg, "body", None),
    )
