// Render a DATE / DATETIME value as a long en-US date, e.g. "March 15, 2008".
//
// Historically this called new Date(value) unconditionally, which is
// timezone-unsafe:
//   - a date-only string ("2008-03-15") is parsed as UTC midnight, so it
//     renders as the PREVIOUS day in any negative-offset timezone, and
//   - null/invalid input produced "January 01, 1970" (epoch) instead of nothing.
// Inputs are normalized to a LOCAL calendar date so the rendered day always
// matches the day stored in the database, regardless of the server timezone.

function toLocalDate(value: string | Date): Date | null {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    const raw = value.trim();
    if (raw === "") {
        return null;
    }

    // Date-only "YYYY-MM-DD": build the date from its parts so it is treated as a
    // LOCAL calendar day. new Date("YYYY-MM-DD") would treat it as UTC and shift.
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (dateOnly) {
        const [, year, month, day] = dateOnly;
        if (!year || !month || !day) {
            return null;
        }
        const date = new Date(Number(year), Number(month) - 1, Number(day));
        return Number.isNaN(date.getTime()) ? null : date;
    }

    // Full timestamp / ISO string carries an explicit instant — parse as-is.
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value: string | Date | null | undefined): string | null {
    if (value === null || value === undefined) {
        return null;
    }
    const date = toLocalDate(value);
    if (date === null) {
        return null;
    }
    return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "long",
        day: "2-digit"
    }).format(date);
} 