from pathlib import Path
import sqlite3
from flask import g, has_request_context
from server import config

schema_path = Path(__file__).resolve().parent / "schema.sql"

def get_db_connection():
    conn = sqlite3.connect(config.DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def get_db():
    if has_request_context():
        if "db" not in g:
            g.db = get_db_connection()
        return g.db
    return get_db_connection()

def close_db(error = None):
    if has_request_context():
        db = g.pop("db", None)
        if db is not None:
            db.close()

def init_db():
    with open(schema_path, "r", encoding="utf-8") as f:
        sql_script = f.read()
    conn = get_db_connection()
    conn.executescript(sql_script)
    conn.commit()
    conn.close()

def check_db():
    db_file = Path(config.DATABASE_PATH)
    if db_file.is_file():
        try:
            conn = sqlite3.connect(config.DATABASE_PATH)
            cursor = conn.execute("PRAGMA quick_check;")
            status = cursor.fetchone()[0]
            conn.close()
            if status != "ok":
                raise RuntimeError(f"Database file {config.DATABASE_PATH} is corrupted: {status}. Halting startup to avoid data loss.")
        except sqlite3.DatabaseError as err:
            raise RuntimeError(f"Database file {config.DATABASE_PATH} is corrupted: {err}. Halting startup to avoid data loss.")
    else:
        init_db()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully.")