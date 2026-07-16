# src/services/outlook_msg.py

from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

import extract_msg  # Paket "extract-msg"[web:130]


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
    """
    Erwartet ein file-like Objekt (.msg) und gibt normalisierte Event-Daten zurück.
    """

    msg = extract_msg.Message(file_obj)  # type: ignore[arg-type]
    msg_sender = getattr(msg, "sender", None)
    msg_to = getattr(msg, "to", "") or ""
    msg_cc = getattr(msg, "cc", "") or ""

    attendees: List[str] = []
    for part in (msg_to, msg_cc):
        for addr in part.split(";"):
            addr = addr.strip()
            if addr:
                attendees.append(addr)

    # extract_msg gibt je nach Version ein datetime oder String zurück
    raw_date = getattr(msg, "date", None)
    starts_at: Optional[datetime]
    if isinstance(raw_date, datetime):
        starts_at = raw_date
    else:
        try:
            starts_at = datetime.fromisoformat(str(raw_date)) if raw_date else None
        except Exception:
            starts_at = None

    # Endzeit ist in vielen .msg-Terminexporten nicht separat vorhanden.
    # Optional: hier heuristisch +1h setzen oder None lassen.
    ends_at: Optional[datetime] = None

    return OutlookEventData(
        subject=getattr(msg, "subject", "") or "",
        starts_at=starts_at,
        ends_at=ends_at,
        location=getattr(msg, "location", None),
        organizer=msg_sender,
        attendees=attendees,
        body=getattr(msg, "body", None),
    )
