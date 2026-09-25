export const box_intervals = {
    1: 1,
    2: 2,
    3: 4,
    4: 8,
    5: 16
};

export function add_days(date_str, days) {
    const parts = date_str.split("-").map(Number);
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function is_due(progress, today) {
    if (!progress || !progress.due_date) {
        return false;
    }
    if (progress.hidden === 1) {
        return false;
    }
    return progress.due_date <= today;
}

export function schedule_card(progress, was_correct, today) {
    if (!today || typeof today !== "string") {
        throw new Error("today date string (YYYY-MM-DD) is required.");
    }

    const current_box = progress && progress.box >= 1 && progress.box <= 5 ? progress.box : 1;
    const new_box = was_correct ? Math.min(current_box + 1, 5) : 1;
    const gap = box_intervals[new_box];
    const new_due_date = add_days(today, gap);

    const old_right = progress && typeof progress.times_right === "number" ? progress.times_right : 0;
    const old_wrong = progress && typeof progress.times_wrong === "number" ? progress.times_wrong : 0;

    const new_times_right = was_correct ? old_right + 1 : old_right;
    const new_times_wrong = was_correct ? old_wrong : old_wrong + 1;

    const introduced_on = progress && progress.introduced_on ? progress.introduced_on : today;
    const hidden = progress && progress.hidden ? progress.hidden : 0;

    return {
        ...(progress || {}),
        box: new_box,
        due_date: new_due_date,
        last_reviewed: today,
        introduced_on: introduced_on,
        times_right: new_times_right,
        times_wrong: new_times_wrong,
        hidden: hidden
    };
}

export { schedule_card as scheduler };