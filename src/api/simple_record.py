from flask import Blueprint, render_template
from flask_login import login_required, current_user
import os

simple_record_bp = Blueprint('simple_record', __name__)


@simple_record_bp.route('/record')
@login_required
def record_page():
    user_language = (
        current_user.ui_language
        if current_user.is_authenticated and current_user.ui_language
        else 'en'
    )
    server_recording_chunks_enabled = (
        os.environ.get('ENABLE_SERVER_RECORDING_CHUNKS', 'false').lower() == 'true'
    )
    try:
        recording_chunk_seconds = int(float(os.environ.get('RECORDING_CHUNK_SECONDS', '5')))
    except (TypeError, ValueError):
        recording_chunk_seconds = 5
    recording_chunk_seconds = max(1, min(60, recording_chunk_seconds))

    return render_template(
        'record.html',
        user_language=user_language,
        server_recording_chunks_enabled=server_recording_chunks_enabled,
        recording_chunk_seconds=recording_chunk_seconds,
    )
