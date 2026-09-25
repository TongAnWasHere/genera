import {
    open_db,
    get_all_own_cards,
    get_today_date,
    get_utc_now
} from "./localdb.js";

const max_file_size = 1024 * 1024;
const max_own_cards = 5000;

export function parse_csv(csv_text) {
    const rows = [];
    let current_row = [];
    let current_field = "";
    let inside_quotes = false;
    let i = 0;
    const len = csv_text.length;

    while (i < len) {
        const char = csv_text[i];

        if (inside_quotes) {
            if (char === '"') {
                if (i + 1 < len && csv_text[i + 1] === '"') {
                    current_field += '"';
                    i += 2;
                    continue;
                } else {
                    inside_quotes = false;
                    i++;
                    continue;
                }
            } else {
                current_field += char;
                i++;
                continue;
            }
        } else {
            if (char === '"') {
                inside_quotes = true;
                i++;
                continue;
            } else if (char === ',') {
                current_row.push(current_field);
                current_field = "";
                i++;
                continue;
            } else if (char === '\r') {
                if (i + 1 < len && csv_text[i + 1] === '\n') {
                    i++;
                }
                current_row.push(current_field);
                rows.push(current_row);
                current_row = [];
                current_field = "";
                i++;
                continue;
            } else if (char === '\n') {
                current_row.push(current_field);
                rows.push(current_row);
                current_row = [];
                current_field = "";
                i++;
                continue;
            } else {
                current_field += char;
                i++;
                continue;
            }
        }
    }

    if (inside_quotes) {
        throw new Error("Malformed CSV: unclosed quote detected. Nothing was imported.");
    }

    if (current_field !== "" || current_row.length > 0) {
        current_row.push(current_field);
        rows.push(current_row);
    }

    return rows;
}

async function validate_and_save_cards(card_rows) {
    const existing_cards = await get_all_own_cards(false);
    const existing_keys = new Set();
    for (const card of existing_cards) {
        const key = card.question.trim().toLowerCase() + "::" + card.category.trim().toLowerCase();
        existing_keys.add(key);
    }

    const valid_cards = [];
    const skipped_reports = [];

    for (const item of card_rows) {
        const row_num = item.row_num;

        if (item.invalid_item) {
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

    const card_rows = [];
    for (let i = 0; i < parsed_data.length; i++) {
        const item = parsed_data[i];
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            card_rows.push({ row_num: i + 1, invalid_item: true });
        } else {
            card_rows.push({
                row_num: i + 1,
                question: item.question,
                answer: item.answer,
                category: item.category
            });
        }
    }

    return await validate_and_save_cards(card_rows);
}

export async function import_csv_string(csv_string) {
    if (!csv_string || csv_string.trim() === "") {
        throw new Error("File is empty. Nothing was imported.");
    }

    if (csv_string.charCodeAt(0) === 0xFEFF) {
        csv_string = csv_string.slice(1);
    }

    const raw_rows = parse_csv(csv_string);
    const rows = raw_rows.filter((r) => r.some((f) => f.trim() !== ""));

    if (rows.length === 0) {
        throw new Error("CSV file is empty. Nothing was imported.");
    }

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const q_index = header.indexOf("question");
    const a_index = header.indexOf("answer");
    const c_index = header.indexOf("category");

    if (q_index === -1 || a_index === -1) {
        throw new Error("Missing CSV header ('question' and 'answer' columns required). Nothing was imported.");
    }

    if (rows.length === 1) {
        throw new Error("CSV file contains no data rows. Nothing was imported.");
    }

    const card_rows = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        card_rows.push({
            row_num: i + 1,
            question: row[q_index],
            answer: row[a_index],
            category: c_index !== -1 ? row[c_index] : ""
        });
    }

    return await validate_and_save_cards(card_rows);
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
        return await import_csv_string(content);
    } else {
        throw new Error("Unsupported file format. Please upload a JSON or CSV file.");
    }
}