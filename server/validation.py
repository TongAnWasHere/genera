import re

def validate_username(username):
    if not isinstance(username, str):
        return False, "Username must be a string."
    username = username.strip()
    if len(username) < 3 or len(username) > 32:
        return False, "Username must be between 3 and 32 characters."
    if not re.match(r"^[a-zA-Z0-9_]+$", username):
        return False, "Username may only contain letters, digits, and underscores."
    return True, ""

def validate_password(password):
    if not isinstance(password, str):
        return False, "Password must be a string."
    if len(password) < 8 or len(password) > 128:
        return False, "Password must be between 8 and 128 characters."
    return True, ""