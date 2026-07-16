from flask import Blueprint, request, jsonify
from flask_login import login_required

from src.services.outlook_msg import parse_outlook_msg

outlook_bp = Blueprint("outlook", __name__, url_prefix="/api/outlook")


@outlook_bp.route("/parse", methods=["POST"])
@login_required
def parse_outlook():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    if not file.filename.lower().endswith(".msg"):
        return jsonify({"error": "Only .msg files are supported"}), 400

    try:
        data = parse_outlook_msg(file)
    except Exception as e:
        return jsonify({"error": f"Failed to parse .msg file: {e}"}), 400

    return jsonify(
        {
            "subject": data.subject,
            "starts_at": data.starts_at.isoformat() if data.starts_at else None,
            "ends_at": data.ends_at.isoformat() if data.ends_at else None,
            "location": data.location,
            "organizer": data.organizer,
            "attendees": data.attendees,
            "body": data.body,
        }
    )
