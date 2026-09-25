import { build_session, count_session_cards } from "./session.js";
import { schedule_card } from "./scheduler.js";
import {
    save_progress_row,
    get_today_date,
    get_all_catalog_cards,
    get_all_own_cards,
    get_all_progress_rows,
    get_user_settings
} from "./localdb.js";

let current_session = [];
let current_card_index = 0;
let is_flipped = false;
let session_stats = { right: 0, wrong: 0 };
let current_mode = "everything";
let is_session_active = false;
let session_update_callback = null;

export function init_review_view(on_update) {
    session_update_callback = on_update;
    setup_keyboard_shortcuts();
    render_review_view();
}

export async function render_review_view() {
    const container = document.getElementById("review-container");
    if (!container) return;

    container.innerHTML = "";

    if (!is_session_active) {
        await render_start_screen(container);
    } else if (current_card_index >= current_session.length) {
        render_finished_screen(container);
    } else {
        render_active_card(container);
    }
}

async function render_start_screen(container) {
    const start_card = document.createElement("div");
    start_card.className = "review-start-card";

    const title = document.createElement("h2");
    title.textContent = "Start Review Session";

    const desc = document.createElement("p");
    desc.className = "card-answer";
    desc.textContent = "Cards are selected based on your Leitner spaced-repetition schedule.";

    const options_div = document.createElement("div");
    options_div.className = "review-options";

    const opt_all_label = document.createElement("label");
    opt_all_label.className = "review-option-label";
    const opt_all_radio = document.createElement("input");
    opt_all_radio.type = "radio";
    opt_all_radio.name = "review_mode";
    opt_all_radio.value = "everything";
    opt_all_radio.checked = current_mode === "everything";
    opt_all_radio.addEventListener("change", () => {
        current_mode = "everything";
    });
    opt_all_label.appendChild(opt_all_radio);
    opt_all_label.appendChild(document.createTextNode("Everything (Official + Mine)"));

    const opt_mine_label = document.createElement("label");
    opt_mine_label.className = "review-option-label";
    const opt_mine_radio = document.createElement("input");
    opt_mine_radio.type = "radio";
    opt_mine_radio.name = "review_mode";
    opt_mine_radio.value = "only_mine";
    opt_mine_radio.checked = current_mode === "only_mine";
    opt_mine_radio.addEventListener("change", () => {
        current_mode = "only_mine";
    });
    opt_mine_label.appendChild(opt_mine_radio);
    opt_mine_label.appendChild(document.createTextNode("Only my cards"));

    options_div.appendChild(opt_all_label);
    options_div.appendChild(opt_mine_label);

    const catalog_cards = await get_all_catalog_cards();
    const own_cards = await get_all_own_cards(false);
    const progress_rows = await get_all_progress_rows();
    const settings = await get_user_settings();
    const today = get_today_date();

    const counts = count_session_cards({
        catalog_cards,
        own_cards,
        progress_rows,
        settings,
        today
    });

    const info_p = document.createElement("p");
    info_p.className = "card-answer";
    info_p.textContent = `Due today: ${counts.due_count} | New cards left today: ${counts.new_left_count}`;

    const start_btn = document.createElement("button");
    start_btn.id = "btn-start-session";
    start_btn.className = "btn btn-primary";
    start_btn.textContent = "Start Review";
    start_btn.addEventListener("click", async () => {
        start_btn.disabled = true;
        start_btn.textContent = "Building session...";
        const session = await build_session({ mode: current_mode, today: get_today_date() });
        if (session.length === 0) {
            alert("No cards due or eligible for review right now!");
            start_btn.disabled = false;
            start_btn.textContent = "Start Review";
            return;
        }

        current_session = session;
        current_card_index = 0;
        is_flipped = false;
        session_stats = { right: 0, wrong: 0 };
        is_session_active = true;
        render_review_view();
    });

    start_card.appendChild(title);
    start_card.appendChild(desc);
    start_card.appendChild(options_div);
    start_card.appendChild(info_p);
    start_card.appendChild(start_btn);
    container.appendChild(start_card);
}

function render_active_card(container) {
    const card = current_session[current_card_index];

    const header = document.createElement("div");
    header.className = "review-header";

    const badges = document.createElement("div");
    badges.className = "review-meta-badges";

    const cat_badge = document.createElement("span");
    cat_badge.className = "badge";
    cat_badge.textContent = card.category;
    badges.appendChild(cat_badge);

    const source_badge = document.createElement("span");
    source_badge.className = card.card_kind === "catalog" ? "badge badge-official" : "badge badge-mine";
    source_badge.textContent = card.card_kind === "catalog" ? "Official" : "Mine";
    badges.appendChild(source_badge);

    const box_badge = document.createElement("span");
    box_badge.className = "badge";
    box_badge.textContent = card.is_new ? "New" : `Box ${card.progress?.box || 1}`;
    badges.appendChild(box_badge);

    const progress_indicator = document.createElement("div");
    progress_indicator.className = "review-progress-text";
    progress_indicator.textContent = `${current_card_index + 1} of ${current_session.length}`;

    const quit_btn = document.createElement("button");
    quit_btn.className = "btn btn-sm";
    quit_btn.textContent = "Quit";
    quit_btn.addEventListener("click", () => {
        if (confirm("Quit review session? Cards already answered will remain saved.")) {
            is_session_active = false;
            current_session = [];
            render_review_view();
            if (session_update_callback) session_update_callback();
        }
    });

    header.appendChild(badges);
    header.appendChild(progress_indicator);
    header.appendChild(quit_btn);
    container.appendChild(header);

    const flashcard = document.createElement("div");
    flashcard.className = "review-flashcard";

    const body_div = document.createElement("div");
    body_div.className = "review-card-body";

    const q_el = document.createElement("div");
    q_el.className = "review-question";
    q_el.textContent = card.question;
    body_div.appendChild(q_el);

    if (is_flipped) {
        const divider = document.createElement("div");
        divider.className = "review-answer-divider";
        body_div.appendChild(divider);

        const a_el = document.createElement("div");
        a_el.className = "review-answer";
        a_el.textContent = card.answer;
        body_div.appendChild(a_el);
    }

    flashcard.appendChild(body_div);

    const actions_bar = document.createElement("div");
    actions_bar.className = "review-actions-bar";

    if (!is_flipped) {
        const flip_btn = document.createElement("button");
        flip_btn.id = "btn-flip-card";
        flip_btn.className = "btn btn-primary";
        flip_btn.textContent = "Flip (Space)";
        flip_btn.addEventListener("click", () => {
            flip_card();
        });
        actions_bar.appendChild(flip_btn);
    } else {
        const wrong_btn = document.createElement("button");
        wrong_btn.id = "btn-rate-wrong";
        wrong_btn.className = "btn btn-danger";
        wrong_btn.textContent = "Wrong (1)";
        wrong_btn.addEventListener("click", async () => {
            await rate_card(false);
        });

        const right_btn = document.createElement("button");
        right_btn.id = "btn-rate-right";
        right_btn.className = "btn btn-success";
        right_btn.textContent = "Right (2)";
        right_btn.addEventListener("click", async () => {
            await rate_card(true);
        });

        actions_bar.appendChild(wrong_btn);
        actions_bar.appendChild(right_btn);
    }

    flashcard.appendChild(actions_bar);
    container.appendChild(flashcard);
}

function render_finished_screen(container) {
    const finished_card = document.createElement("div");
    finished_card.className = "review-finished-card";

    const title = document.createElement("h2");
    title.textContent = "Session Complete!";

    const total_reviewed = session_stats.right + session_stats.wrong;
    const msg = document.createElement("p");
    msg.className = "card-answer";
    msg.textContent = `You reviewed ${total_reviewed} card(s).`;

    const stats_row = document.createElement("div");
    stats_row.className = "review-finished-stats";

    const right_stat = document.createElement("span");
    right_stat.style.color = "var(--color-green)";
    right_stat.style.fontWeight = "600";
    right_stat.textContent = `✓ ${session_stats.right} Right`;

    const wrong_stat = document.createElement("span");
    wrong_stat.style.color = "var(--color-red)";
    wrong_stat.style.fontWeight = "600";
    wrong_stat.textContent = `✗ ${session_stats.wrong} Wrong`;

    stats_row.appendChild(right_stat);
    stats_row.appendChild(wrong_stat);

    const action_btn = document.createElement("button");
    action_btn.className = "btn btn-primary";
    action_btn.textContent = "Done";
    action_btn.addEventListener("click", () => {
        is_session_active = false;
        current_session = [];
        render_review_view();
        if (session_update_callback) session_update_callback();
    });

    finished_card.appendChild(title);
    finished_card.appendChild(msg);
    finished_card.appendChild(stats_row);
    finished_card.appendChild(action_btn);
    container.appendChild(finished_card);
}

function flip_card() {
    if (!is_session_active || is_flipped) return;
    is_flipped = true;
    render_review_view();
}

async function rate_card(was_correct) {
    if (!is_session_active || !is_flipped) return;

    const card = current_session[current_card_index];
    const today = get_today_date();

    const progress_input = card.progress || {
        card_kind: card.card_kind,
        card_id: card.card_id,
        box: 1,
        times_right: 0,
        times_wrong: 0,
        hidden: 0
    };

    const updated = schedule_card(progress_input, was_correct, today);
    await save_progress_row(updated);

    if (was_correct) {
        session_stats.right += 1;
    } else {
        session_stats.wrong += 1;
    }

    current_card_index += 1;
    is_flipped = false;

    render_review_view();
    if (session_update_callback) session_update_callback();
}

function setup_keyboard_shortcuts() {
    window.addEventListener("keydown", (e) => {
        const review_panel = document.getElementById("tab-review");
        if (!review_panel || review_panel.hidden) return;
        if (!is_session_active) return;
        if (current_card_index >= current_session.length) return;

        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

        if (!is_flipped) {
            if (e.code === "Space" || e.key === " ") {
                e.preventDefault();
                flip_card();
            }
        } else {
            if (e.key === "1") {
                e.preventDefault();
                rate_card(false);
            } else if (e.key === "2") {
                e.preventDefault();
                rate_card(true);
            }
        }
    });
}