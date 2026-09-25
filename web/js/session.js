import {
    get_all_catalog_cards,
    get_all_own_cards,
    get_all_progress_rows,
    get_user_settings,
    get_today_date
} from "./localdb.js";

export function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export function build_session_from_data({
    catalog_cards = [],
    own_cards = [],
    progress_rows = [],
    settings = {},
    mode = "everything",
    today
}) {
    if (!today || typeof today !== "string") {
        throw new Error("today date string (YYYY-MM-DD) is required.");
    }

    const daily_new_limit = typeof settings.daily_new_limit === "number" ? settings.daily_new_limit : 10;
    const enabled_categories = Array.isArray(settings.enabled_categories) ? settings.enabled_categories : [];

    function is_category_enabled(cat) {
        if (!cat) return true;
        if (enabled_categories.length === 0) return true;
        return enabled_categories.includes(cat);
    }

    const progress_map = new Map();
    let introduced_today_count = 0;

    for (const p of progress_rows) {
        const key = `${p.card_kind}:${p.card_id}`;
        progress_map.set(key, p);

        if (p.card_kind === "catalog" && p.introduced_on === today) {
            introduced_today_count += 1;
        }
    }

    const catalog_map = new Map();
    for (const c of catalog_cards) {
        catalog_map.set(c.id, c);
    }

    const own_map = new Map();
    for (const c of own_cards) {
        if (c.deleted !== 1) {
            own_map.set(c.id, c);
        }
    }

    const session_cards = [];

    // 1. Due cards: every non-hidden progress row with due_date <= today
    for (const p of progress_rows) {
        if (p.hidden === 1) {
            continue;
        }

        if (!p.due_date || p.due_date > today) {
            continue;
        }

        if (mode === "only_mine" && p.card_kind !== "own") {
            continue;
        }

        let card_data = null;
        if (p.card_kind === "catalog") {
            card_data = catalog_map.get(p.card_id);
        } else if (p.card_kind === "own") {
            card_data = own_map.get(p.card_id);
        }

        if (!card_data) {
            continue;
        }

        if (!is_category_enabled(card_data.category)) {
            continue;
        }

        session_cards.push({
            card_kind: p.card_kind,
            card_id: p.card_id,
            question: card_data.question,
            answer: card_data.answer,
            category: card_data.category,
            is_new: false,
            progress: p
        });
    }

    // 2. New official cards (only in "everything" mode)
    if (mode === "everything" && daily_new_limit > 0) {
        const remaining_quota = Math.max(0, daily_new_limit - introduced_today_count);

        if (remaining_quota > 0) {
            const unseen_catalog = [];
            for (const c of catalog_cards) {
                const key = `catalog:${c.id}`;
                if (!progress_map.has(key) && is_category_enabled(c.category)) {
                    unseen_catalog.push(c);
                }
            }

            const shuffled_unseen = shuffle(unseen_catalog);
            const picked_catalog = shuffled_unseen.slice(0, remaining_quota);

            for (const c of picked_catalog) {
                session_cards.push({
                    card_kind: "catalog",
                    card_id: c.id,
                    question: c.question,
                    answer: c.answer,
                    category: c.category,
                    is_new: true,
                    progress: null
                });
            }
        }
    }

    // 3. New own cards (always eligible, uncapped by daily limit)
    for (const c of own_cards) {
        if (c.deleted === 1) {
            continue;
        }

        if (!is_category_enabled(c.category)) {
            continue;
        }

        const key = `own:${c.id}`;
        const p = progress_map.get(key);

        if (!p) {
            session_cards.push({
                card_kind: "own",
                card_id: c.id,
                question: c.question,
                answer: c.answer,
                category: c.category,
                is_new: true,
                progress: null
            });
        }
    }

    // 4. Shuffle everything together
    return shuffle(session_cards);
}

export function count_session_cards({
    catalog_cards = [],
    own_cards = [],
    progress_rows = [],
    settings = {},
    today
}) {
    const daily_new_limit = typeof settings.daily_new_limit === "number" ? settings.daily_new_limit : 10;
    const enabled_categories = Array.isArray(settings.enabled_categories) ? settings.enabled_categories : [];

    function is_category_enabled(cat) {
        if (!cat) return true;
        if (enabled_categories.length === 0) return true;
        return enabled_categories.includes(cat);
    }

    const progress_map = new Map();
    let introduced_today_count = 0;
    let due_count = 0;
    const box_counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    const catalog_map = new Map();
    for (const c of catalog_cards) {
        catalog_map.set(c.id, c);
    }

    const own_map = new Map();
    for (const c of own_cards) {
        if (c.deleted !== 1) {
            own_map.set(c.id, c);
        }
    }

    for (const p of progress_rows) {
        const key = `${p.card_kind}:${p.card_id}`;
        progress_map.set(key, p);

        if (p.card_kind === "catalog" && p.introduced_on === today) {
            introduced_today_count += 1;
        }

        if (p.hidden !== 1) {
            const card_data = p.card_kind === "catalog" ? catalog_map.get(p.card_id) : own_map.get(p.card_id);
            if (card_data && is_category_enabled(card_data.category)) {
                if (p.due_date && p.due_date <= today) {
                    due_count += 1;
                }
                const box_num = p.box >= 1 && p.box <= 5 ? p.box : 1;
                box_counts[box_num] = (box_counts[box_num] || 0) + 1;
            }
        }
    }

    const remaining_new_official = Math.max(0, daily_new_limit - introduced_today_count);

    let unseen_catalog_count = 0;
    for (const c of catalog_cards) {
        const key = `catalog:${c.id}`;
        if (!progress_map.has(key) && is_category_enabled(c.category)) {
            unseen_catalog_count += 1;
        }
    }

    let unseen_own_count = 0;
    for (const c of own_cards) {
        if (c.deleted !== 1) {
            const key = `own:${c.id}`;
            if (!progress_map.has(key) && is_category_enabled(c.category)) {
                unseen_own_count += 1;
            }
        }
    }

    return {
        due_count: due_count,
        introduced_today_count: introduced_today_count,
        new_left_count: Math.min(remaining_new_official, unseen_catalog_count),
        unseen_count: unseen_catalog_count + unseen_own_count,
        total_visible: catalog_cards.filter((c) => is_category_enabled(c.category)).length + own_map.size,
        box_counts: box_counts
    };
}

export async function build_session({ mode = "everything", today = get_today_date() } = {}) {
    const catalog_cards = await get_all_catalog_cards();
    const own_cards = await get_all_own_cards(false);
    const progress_rows = await get_all_progress_rows();
    const settings = await get_user_settings();

    return build_session_from_data({
        catalog_cards,
        own_cards,
        progress_rows,
        settings,
        mode,
        today
    });
}