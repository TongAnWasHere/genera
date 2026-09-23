import os
from flask import Flask, send_from_directory
from server import config, db
from server.auth import auth_bp

app = Flask(__name__, static_folder="../web", static_url_path="")
app.config["SECRET_KEY"] = config.SECRET_KEY
app.config["DATABASE_PATH"] = config.DATABASE_PATH
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = True

db.check_db()
app.teardown_appcontext(db.close_db)
app.register_blueprint(auth_bp)

@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)