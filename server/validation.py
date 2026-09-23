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

def is_valid_date(date_str):
    if not isinstance(date_str, str):
        return False
    return bool(re.match(r"^\d{4}-\d{2}-\d{2}$", date_str))

def is_valid_utc_timestamp(ts_str):
    if not isinstance(ts_str, str):
        return False
    return bool(re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$", ts_str))

def is_valid_uuid(val):
    if not isinstance(val, str):
        return False
    return bool(re.match(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", val))

def is_valid_catalog_id(val):
    if not isinstance(val, str):
        return False
    return bool(re.match(r"^[0-9a-fA-F]{16}$", val))

def validate_own_card(card):
    if not isinstance(card, dict):
        return False, "own_card must be an object.", "own_cards"

    card_id = card.get("id")
    if not is_valid_uuid(card_id):
        return False, "Card id must be a valid UUID.", "id"

    question = card.get("question")
    if not isinstance(question, str) or not (1 <= len(question.strip()) <= 500):
        return False, "Question must be between 1 and 500 non-blank characters.", "question"

    answer = card.get("answer")
    if not isinstance(answer, str) or not (1 <= len(answer.strip()) <= 500):
        return False, "Answer must be between 1 and 500 non-blank characters.", "answer"

    category = card.get("category")
    if not isinstance(category, str) or not (1 <= len(category.strip()) <= 50):
        return False, "Category must be between 1 and 50 non-blank characters.", "category"

    created_at = card.get("created_at")
    if not is_valid_date(created_at):
        return False, "created_at must be in YYYY-MM-DD format.", "created_at"

    updated_at = card.get("updated_at")
    if not is_valid_utc_timestamp(updated_at):
        return False, "updated_at must be in UTC format (YYYY-MM-DDTHH:MM:SSZ).", "updated_at"

    return True, "", ""

def validate_progress_row(item):
    if not isinstance(item, dict):
        return False, "progress row must be an object.", "progress"

    card_kind = item.get("card_kind")
    if card_kind not in ("catalog", "own"):
        return False, "card_kind must be 'catalog' or 'own'.", "card_kind"

    card_id = item.get("card_id")
    if card_kind == "catalog" and not is_valid_catalog_id(card_id):
        return False, "Catalog card_id must be a 16-character hex string.", "card_id"
    if card_kind == "own" and not is_valid_uuid(card_id):
        return False, "Own card_id must be a valid UUID.", "card_id"

    box = item.get("box")
    if not isinstance(box, int) or box < 0 or box > 5:
        return False, "box must be an integer between 0 and 5.", "box"

    due_date = item.get("due_date")
    if not is_valid_date(due_date):
        return False, "due_date must be in YYYY-MM-DD format.", "due_date"

    last_reviewed = item.get("last_reviewed")
    if last_reviewed is not None and not is_valid_date(last_reviewed) and not is_valid_utc_timestamp(last_reviewed):
        return False, "last_reviewed must be a valid date or null.", "last_reviewed"

    introduced_on = item.get("introduced_on")
    if introduced_on is not None and not is_valid_date(introduced_on):
        return False, "introduced_on must be in YYYY-MM-DD format or null.", "introduced_on"

    times_right = item.get("times_right", 0)
    if not isinstance(times_right, int) or times_right < 0:
        return False, "times_right must be a non-negative integer.", "times_right"

    times_wrong = item.get("times_wrong", 0)
    if not isinstance(times_wrong, int) or times_wrong < 0:
        return False, "times_wrong must be a non-negative integer.", "times_wrong"

    updated_at = item.get("updated_at")
    if not is_valid_utc_timestamp(updated_at):
        return False, "updated_at must be in UTC format (YYYY-MM-DDTHH:MM:SSZ).", "updated_at"

    return True, "", ""

def validate_settings(settings):
    if not isinstance(settings, dict):
        return False, "settings must be an object.", "settings"

    limit = settings.get("daily_new_limit")
    if not isinstance(limit, int) or limit < 0 or limit > 100:
        return False, "daily_new_limit must be an integer between 0 and 100.", "daily_new_limit"

    cats = settings.get("enabled_categories")
    if not isinstance(cats, list) or len(cats) > 100:
        return False, "enabled_categories must be a list of at most 100 items.", "enabled_categories"
    for cat in cats:
        if not isinstance(cat, str) or not (1 <= len(cat) <= 100):
            return False, "Each enabled category must be between 1 and 100 characters.", "enabled_categories"

    updated_at = settings.get("updated_at")
    if not is_valid_utc_timestamp(updated_at):
        return False, "updated_at must be in UTC format (YYYY-MM-DDTHH:MM:SSZ).", "updated_at"

    return True, "", ""