import hashlib
import html
import json
from pathlib import Path
import sys
import time
import urllib.parse
import urllib.request

api_url = "https://opentdb.com/api.php"
token_url = "https://opentdb.com/api_token.php?command=request"
last_request_time = 0.0

def rate_limited_get(url):
    global last_request_time
    elapsed = time.time() - last_request_time
    if elapsed < 5.0:
        time.sleep(5.0 - elapsed)
    with urllib.request.urlopen(url) as response:
        last_request_time = time.time()
        return json.loads(response.read().decode())

def request_new_token():
    data = rate_limited_get(token_url)
    token = data.get("token")
    print(f"Requested new session token: {token}", flush=True)
    return token

def fetch_category(category_id, session_token):
    questions = []
    batch_size = 50
    token = session_token

    while True:
        query = urllib.parse.urlencode({
            "amount": batch_size,
            "category": category_id,
            "type": "multiple",
            "encode": "url3986",
            "token": token
        })
        url = f"{api_url}?{query}"

        try:
            data = rate_limited_get(url)
        except Exception as error:
            print(f"Network error on category {category_id}: {error}. Retrying in 5s...", flush=True)
            time.sleep(5.0)
            continue

        code = data.get("response_code")

        if code == 0:
            results = data.get("results", [])
            questions.extend(results)
            print(f"Category {category_id}: fetched {len(results)} questions (batch: {batch_size}, total: {len(questions)})", flush=True)
            if len(results) < batch_size:
                break
        elif code == 1:
            if batch_size > 1:
                batch_size = max(1, batch_size // 2)
            else:
                break
        elif code == 4:
            if batch_size > 1:
                batch_size = max(1, batch_size // 2)
            else:
                print(f"Category {category_id}: token exhausted (code 4). Requesting new token...", flush=True)
                token = request_new_token()
                break
        elif code == 5:
            print("Rate limit reached (code 5). Backing off for 6 seconds...", flush=True)
            time.sleep(6.0)
        elif code == 3:
            print("Token not found (code 3). Requesting new token...", flush=True)
            token = request_new_token()
        elif code == 2:
            print(f"Invalid parameter (code 2) on category {category_id}. Skipping.", flush=True)
            break

    return questions, token

def fetch_all_categories():
    print("Starting catalog fetch across categories 9 to 32...", flush=True)
    token = request_new_token()
    all_questions = []

    for category_id in range(9, 33):
        print(f"Fetching category {category_id}...", flush=True)
        category_questions, token = fetch_category(category_id, token)
        all_questions.extend(category_questions)
        print(f"Category {category_id} finished with {len(category_questions)} questions. Running total: {len(all_questions)}", flush=True)

    return all_questions

def normalize_text(text):
    unquoted = urllib.parse.unquote(text)
    clean_text = html.unescape(unquoted)
    return " ".join(clean_text.strip().split())

def compute_card_id(question, category):
    key = f"{question}:{category}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]

def clean_raw_questions(raw_questions):
    cards = []
    seen_ids = set()

    for item in raw_questions:
        if item.get("type") != "multiple":
            continue

        question = normalize_text(item.get("question", ""))
        answer = normalize_text(item.get("correct_answer", ""))
        category = normalize_text(item.get("category", ""))

        if not question or not answer or not category:
            continue

        card_id = compute_card_id(question, category)
        if card_id in seen_ids:
            continue

        seen_ids.add(card_id)
        cards.append({
            "id": card_id,
            "question": question,
            "answer": answer,
            "category": category
        })

    return cards

def save_catalog_files(cards, version = 1):
    data_dir = Path(__file__).resolve().parent.parent / "web" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    catalog_payload = {
        "version": version,
        "attribution": "Questions sourced from Open Trivia DB (opentdb.com), licensed under CC BY-SA 4.0.",
        "cards": cards
    }

    catalog_path = data_dir / "catalog.json"
    catalog_json = json.dumps(catalog_payload, indent=2, ensure_ascii=False)
    with open(catalog_path, "w", encoding="utf-8") as f:
        f.write(catalog_json.rstrip("\r\n"))

    manifest_path = data_dir / "catalog-manifest.json"
    manifest_json = json.dumps({"version": version}, indent=2)
    with open(manifest_path, "w", encoding="utf-8") as f:
        f.write(manifest_json.rstrip("\r\n"))

def main():
    data_dir = Path(__file__).resolve().parent.parent / "web" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    raw_file = data_dir / "raw_questions.json"

    if raw_file.exists():
        print(f"Reading cached raw questions from {raw_file}...", flush=True)
        with open(raw_file, "r", encoding="utf-8") as f:
            all_questions = json.load(f)
    else:
        all_questions = fetch_all_categories()
        with open(raw_file, "w", encoding="utf-8") as f:
            f.write(json.dumps(all_questions, indent=2).rstrip("\r\n"))

    print(f"Processing {len(all_questions)} raw questions...", flush=True)
    cards = clean_raw_questions(all_questions)
    print(f"Produced {len(cards)} unique clean cards.", flush=True)

    manifest_path = data_dir / "catalog-manifest.json"
    target_version = 1
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        target_version = int(sys.argv[1])
    elif manifest_path.exists():
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest_data = json.load(f)
                target_version = manifest_data.get("version", 1)
        except Exception:
            target_version = 1

    save_catalog_files(cards, version = target_version)
    print(f"Catalog and manifest (v{target_version}) saved to web/data/catalog.json and web/data/catalog-manifest.json", flush=True)

if __name__ == "__main__":
    main()