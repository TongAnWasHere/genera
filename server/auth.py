from datetime import datetime, timezone
import sqlite3
import time
from flask import Blueprint, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash
from server import db
from server.validation import validate_password, validate_username

auth_bp = Blueprint("auth", __name__, url_prefix="/api")
login_attempts = {}

def is_rate_limited(ip, username):
    now = time.time()
    window = 900
    ip_key = f"ip:{ip}"
    user_key = f"user:{username.lower()}"
    ip_failures = [t for t in login_attempts.get(ip_key, []) if now - t < window]
    user_failures = [t for t in login_attempts.get(user_key, []) if now - t < window]
    login_attempts[ip_key] = ip_failures
    login_attempts[user_key] = user_failures
    return len(ip_failures) >= 5 or len(user_failures) >= 5

def record_failure(ip, username):
    now = time.time()
    ip_key = f"ip:{ip}"
    user_key = f"user:{username.lower()}"
    login_attempts.setdefault(ip_key, []).append(now)
    login_attempts.setdefault(user_key, []).append(now)

def clear_failures(ip, username):
    user_key = f"user:{username.lower()}"
    login_attempts.pop(user_key, None)

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

@auth_bp.route("/login", methods=["POST"])
def login():
    if not request.is_json:
        return jsonify({"error": "Request body must be JSON."}), 400

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Malformed JSON body."}), 400

    username = data.get("username", "")
    password = data.get("password", "")

    if not username or not password:
        return jsonify({"error": "Username and password are required."}), 400

    client_ip = request.remote_addr or "127.0.0.1"

    if is_rate_limited(client_ip, username):
        return jsonify({"error": "Too many failed login attempts. Please try again later."}), 429

    conn = db.get_db()
    user = conn.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username.strip(),)
    ).fetchone()

    if not user or not check_password_hash(user["password_hash"], password):
        record_failure(client_ip, username)
        return jsonify({"error": "Invalid username or password."}), 401

    clear_failures(client_ip, username)
    session.clear()
    session["user_id"] = user["id"]
    session["username"] = user["username"]

    return jsonify({"id": user["id"], "username": user["username"]}), 200

@auth_bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Logged out successfully."}), 200

@auth_bp.route("/me", methods=["GET"])
def me():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Not logged in."}), 401

    return jsonify({"id": user_id, "username": session.get("username", "")}), 200