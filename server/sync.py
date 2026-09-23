import json
import sqlite3
from flask import Blueprint, jsonify, request, session
from server import db

sync_bp = Blueprint("sync", __name__, url_prefix="/api")

def get_next_version(conn):
    conn.execute("UPDATE meta SET value = value + 1 WHERE key = 'global_version'")
    row = conn.execute("SELECT value FROM meta WHERE key = 'global_version'").fetchone()
    return row[0]

def get_current_version(conn):
    row = conn.execute("SELECT value FROM meta WHERE key = 'global_version'").fetchone()
    return row[0] if row else 0

def sync_own_cards(conn, user_id, incoming_cards):
    for card in incoming_cards:
        card_id = card.get("id")
        updated_at = card.get("updated_at")
        question = card.get("question")
        answer = card.get("answer")
        category = card.get("category")
        created_at = card.get("created_at")
        deleted = 1 if card.get("deleted") else 0

        existing = conn.execute(
            "SELECT updated_at FROM user_cards WHERE user_id = ? AND id = ?",
            (user_id, card_id)
        ).fetchone()

        if existing is None:
            next_ver = get_next_version(conn)
            conn.execute(
                """
                INSERT INTO user_cards (user_id, id, question, answer, category, created_at, updated_at, deleted, server_version)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (user_id, card_id, question, answer, category, created_at, updated_at, deleted, next_ver)
            )
        elif updated_at > existing["updated_at"]:
            next_ver = get_next_version(conn)
            conn.execute(
                """
                UPDATE user_cards
                SET question = ?, answer = ?, category = ?, created_at = ?, updated_at = ?, deleted = ?, server_version = ?
                WHERE user_id = ? AND id = ?
                """,
                (question, answer, category, created_at, updated_at, deleted, next_ver, user_id, card_id)
            )

def sync_progress(conn, user_id, incoming_progress):
    for item in incoming_progress:
        card_kind = item.get("card_kind")
        card_id = item.get("card_id")
        box = item.get("box", 1)
        due_date = item.get("due_date")
        last_reviewed = item.get("last_reviewed")
        introduced_on = item.get("introduced_on")
        times_right = item.get("times_right", 0)
        times_wrong = item.get("times_wrong", 0)
        hidden = 1 if item.get("hidden") else 0
        updated_at = item.get("updated_at")

        existing = conn.execute(
            """
            SELECT updated_at FROM progress
            WHERE user_id = ? AND card_kind = ? AND card_id = ?
            """,
            (user_id, card_kind, card_id)
        ).fetchone()

        if existing is None:
            next_ver = get_next_version(conn)
            conn.execute(
                """
                INSERT INTO progress (user_id, card_kind, card_id, box, due_date, last_reviewed, introduced_on, times_right, times_wrong, hidden, updated_at, server_version)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (user_id, card_kind, card_id, box, due_date, last_reviewed, introduced_on, times_right, times_wrong, hidden, updated_at, next_ver)
            )
        elif updated_at > existing["updated_at"]:
            next_ver = get_next_version(conn)
            conn.execute(
                """
                UPDATE progress
                SET box = ?, due_date = ?, last_reviewed = ?, introduced_on = ?, times_right = ?, times_wrong = ?, hidden = ?, updated_at = ?, server_version = ?
                WHERE user_id = ? AND card_kind = ? AND card_id = ?
                """,
                (box, due_date, last_reviewed, introduced_on, times_right, times_wrong, hidden, updated_at, next_ver, user_id, card_kind, card_id)
            )

def sync_settings(conn, user_id, incoming_settings):
    if not incoming_settings:
        return

    daily_new_limit = incoming_settings.get("daily_new_limit", 10)
    enabled_categories = incoming_settings.get("enabled_categories", "[]")
    if isinstance(enabled_categories, list):
        enabled_categories = json.dumps(enabled_categories)
    updated_at = incoming_settings.get("updated_at")

    existing = conn.execute(
        "SELECT updated_at FROM user_settings WHERE user_id = ?",
        (user_id,)
    ).fetchone()

    if existing is None:
        next_ver = get_next_version(conn)
        conn.execute(
            """
            INSERT INTO user_settings (user_id, daily_new_limit, enabled_categories, updated_at, server_version)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user_id, daily_new_limit, enabled_categories, updated_at, next_ver)
        )
    elif updated_at > existing["updated_at"]:
        next_ver = get_next_version(conn)
        conn.execute(
            """
            UPDATE user_settings
            SET daily_new_limit = ?, enabled_categories = ?, updated_at = ?, server_version = ?
            WHERE user_id = ?
            """,
            (daily_new_limit, enabled_categories, updated_at, next_ver, user_id)
        )

@sync_bp.route("/sync", methods=["POST"])
def sync():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Not logged in."}), 401

    if not request.is_json:
        return jsonify({"error": "Request body must be JSON."}), 400

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Malformed JSON body."}), 400

    since = data.get("since", 0)
    incoming_cards = data.get("own_cards", [])
    incoming_progress = data.get("progress", [])
    incoming_settings = data.get("settings")

    conn = db.get_db()

    try:
        conn.execute("BEGIN TRANSACTION")

        sync_own_cards(conn, user_id, incoming_cards)
        sync_progress(conn, user_id, incoming_progress)
        sync_settings(conn, user_id, incoming_settings)

        # Collect pushed IDs to guarantee returning final server state
        pushed_card_ids = [c["id"] for c in incoming_cards if "id" in c]
        pushed_progress_keys = [(p["card_kind"], p["card_id"]) for p in incoming_progress if "card_kind" in p and "card_id" in p]

        # Fetch own cards changed after since OR sent in this push
        all_user_cards = conn.execute(
            "SELECT id, question, answer, category, created_at, updated_at, deleted, server_version FROM user_cards WHERE user_id = ?",
            (user_id,)
        ).fetchall()

        out_cards = []
        for r in all_user_cards:
            if r["server_version"] > since or r["id"] in pushed_card_ids:
                out_cards.append({
                    "id": r["id"],
                    "question": r["question"],
                    "answer": r["answer"],
                    "category": r["category"],
                    "created_at": r["created_at"],
                    "updated_at": r["updated_at"],
                    "deleted": r["deleted"]
                })

        # Fetch progress changed after since OR sent in this push
        all_user_progress = conn.execute(
            "SELECT card_kind, card_id, box, due_date, last_reviewed, introduced_on, times_right, times_wrong, hidden, updated_at, server_version FROM progress WHERE user_id = ?",
            (user_id,)
        ).fetchall()

        out_progress = []
        for r in all_user_progress:
            key = (r["card_kind"], r["card_id"])
            if r["server_version"] > since or key in pushed_progress_keys:
                out_progress.append({
                    "card_kind": r["card_kind"],
                    "card_id": r["card_id"],
                    "box": r["box"],
                    "due_date": r["due_date"],
                    "last_reviewed": r["last_reviewed"],
                    "introduced_on": r["introduced_on"],
                    "times_right": r["times_right"],
                    "times_wrong": r["times_wrong"],
                    "hidden": r["hidden"],
                    "updated_at": r["updated_at"]
                })

        # Fetch settings
        settings_row = conn.execute(
            "SELECT daily_new_limit, enabled_categories, updated_at, server_version FROM user_settings WHERE user_id = ?",
            (user_id,)
        ).fetchone()

        out_settings = None
        if settings_row:
            if settings_row["server_version"] > since or incoming_settings is not None:
                categories = []
                try:
                    categories = json.loads(settings_row["enabled_categories"])
                except Exception:
                    categories = []
                out_settings = {
                    "daily_new_limit": settings_row["daily_new_limit"],
                    "enabled_categories": categories,
                    "updated_at": settings_row["updated_at"]
                }

        current_version = get_current_version(conn)
        conn.commit()

        return jsonify({
            "own_cards": out_cards,
            "progress": out_progress,
            "settings": out_settings,
            "version": current_version,
            "has_more": False
        }), 200

    except Exception as err:
        conn.rollback()
        return jsonify({"error": f"Sync transaction failed: {str(err)}"}), 500