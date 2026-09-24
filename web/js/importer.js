import {
    open_db,
    get_all_own_cards,
    get_today_date,
    get_utc_now
} from "./localdb.js";

const max_file_size = 1024 * 1024;
const max_own_cards = 5000;

export async function import_json_string(json_string) {
    if (!json_string || json_string.trim() === "") {
        throw new Error("File is empty. Nothing was imported.");
    }

    let parsed_data;
    try {
        parsed_data = JSON.parse(json_string);
    } catch (err) {
        throw new Error("Malformed JSON file. Nothing was imported.");
    }

    if (!Array.isArray(parsed_data)) {
        throw new Error("JSON file must contain an array of cards. Nothing was imported.");
    }

    if (parsed_data.length === 0) {
        throw new Error("JSON array is empty. Nothing was imported.");
    }

    const existing_cards = await get_all_own_cards(false);
    const existing_keys = new Set();
    for (const card of existing_cards) {
        const key = card.question.trim().toLowerCase() + "::" + card.category.trim().toLowerCase();
        existing_keys.add(key);
    }

    const valid_cards = [];
    const skipped_reports = [];

    for (let i = 0; i < parsed_data.length; i++) {
        const row_num = i + 1;
        const item = parsed_data[i];

        if (!item || typeof item !== "object" || Array.isArray(item)) {
            skipped_reports.push(`Row ${row_num}: item is not an object.`);
            continue;
        }

        const question = typeof item.question === "string" ? item.question.trim() : "";
        const answer = typeof item.answer === "string" ? item.answer.trim() : "";
        let category = typeof item.category === "string" ? item.category.trim() : "";

        if (!question || question.length > 500) {
            skipped_reports.push(`Row ${row_num}: question must be between 1 and 500 characters.`);
            continue;
        }

        if (!answer || answer.length > 500) {
            skipped_reports.push(`Row ${row_num}: answer must be between 1 and 500 characters.`);
            continue;
        }

        if (!category) {
            category = "Uncategorized";
        } else if (category.length > 50) {
            skipped_reports.push(`Row ${row_num}: category must be between 1 and 50 characters.`);
            continue;
        }

        const card_key = question.toLowerCase() + "::" + category.toLowerCase();
        if (existing_keys.has(card_key)) {
            skipped_reports.push(`Row ${row_num}: duplicate card.`);
            continue;
        }

        existing_keys.add(card_key);
        valid_cards.push({
            id: crypto.randomUUID(),
            question: question,
            answer: answer,
            category: category,
            created_at: get_today_date(),
            updated_at: get_utc_now(),
            deleted: 0,
            dirty: 1
        });
    }

    if (existing_cards.length + valid_cards.length > max_own_cards) {
        throw new Error(`Import would exceed the limit of ${max_own_cards} own cards per account.`);
    }

    if (valid_cards.length > 0) {
        const db = await open_db();
        await new Promise((resolve, reject) => {
            const tx = db.transaction("own_cards", "readwrite");
            const store = tx.objectStore("own_cards");
            for (const card of valid_cards) {
                store.put(card);
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(new Error("Failed to save imported cards: " + tx.error));
        });
    }

    return {
        imported_count: valid_cards.length,
        skipped_count: skipped_reports.length,
        skipped_details: skipped_reports
    };
}

export async function process_import_file(file) {
    if (file.size > max_file_size) {
        throw new Error("File exceeds 1 MB limit. Nothing was imported.");
    }
    if (file.size === 0) {
        throw new Error("File is empty. Nothing was imported.");
    }

    const file_name = file.name.toLowerCase();
    const content = await file.text();

    if (file_name.endsWith(".json")) {
        return await import_json_string(content);
    } else if (file_name.endsWith(".csv")) {
        throw new Error("CSV import is coming in Phase 12. Please upload a JSON file.");
    } else {
        throw new Error("Unsupported file format. Please upload a JSON file.");
    }
}