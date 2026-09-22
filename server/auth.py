from datetime import datetime, timezone
import sqlite3
from flask import Blueprint, jsonify, request, session
from werkzeug.security import generate_password_hash
from server import db
from server.validation import validate_password, validate_username

auth_bp = Blueprint("auth", __name__, url_prefix="/api")

@auth_bp.route("/register", methods=["POST"])
def register():
    if not request.is_json:
        return jsonify({"error": "Request body must be JSON."}), 400

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Malformed JSON body."}), 400

    username = data.get("username", "")
    password = data.get("password", "")

    valid_user, user_err = validate_username(username)
    if not valid_user:
        return jsonify({"error": user_err, "field": "username"}), 400

    valid_pass, pass_err = validate_password(password)
    if not valid_pass:
        return jsonify({"error": pass_err, "field": "password"}), 400

    username = username.strip()
    password_hash = generate_password_hash(password)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    conn = db.get_db()
    cursor = conn.cursor()

    existing = cursor.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if existing:
        return jsonify({"error": "Username is already taken."}), 409

    try:
        cursor.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, password_hash, timestamp)
        )
        user_id = cursor.lastrowid
        cursor.execute(
            "INSERT INTO user_settings (user_id, daily_new_limit, enabled_categories, updated_at, server_version) VALUES (?, 10, '[]', ?, 0)",
            (user_id, timestamp)
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()
        return jsonify({"error": "Username is already taken."}), 409

    session["user_id"] = user_id
    session["username"] = username

    return jsonify({"id": user_id, "username": username}), 201