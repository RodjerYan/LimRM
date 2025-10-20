let smoothedTimePerItem = 0;
const SMOOTHING_FACTOR = 0.1; // Smaller value = smoother but slower to react

/**
 * Resets the ETR (Estimated Time Remaining) smoothing calculation.
 * This should be called before starting a new batch of timed operations.
 */
export function resetEtr() {
    smoothedTimePerItem = 0;
}

/**
 * Formats a duration in seconds into a human-readable string (e.g., "~ 1 мин 30 сек").
 * @param seconds The duration in seconds.
 * @returns A formatted string representing the time remaining.
 */
export function formatTime(seconds: number): string {
    if (isNaN(seconds) || !isFinite(seconds) || seconds <= 1) {
        return 'расчет времени...';
    }
    if (seconds < 2) {
        return 'осталось менее пары секунд';
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    
    let result = '~';
    if (minutes > 0) {
        result += ` ${minutes} мин`;
    }
    if (remainingSeconds > 0 || minutes === 0) {
        result += ` ${remainingSeconds} сек`;
    }
    return `Осталось ${result}`;
}

/**
 * Calculates the Estimated Time Remaining (ETR) for a process using exponential smoothing.
 * @param startTime The timestamp (in ms) when the process started.
 * @param done The number of items processed so far.
 * @param total The total number of items to process.
 * @returns The estimated remaining time in seconds.
 */
export function calculateEtr(startTime: number, done: number, total: number): number {
    if (done < 1) return Infinity;
    
    const elapsedTime = (Date.now() - startTime) / 1000;
    const currentTimePerItem = elapsedTime / done;

    // Initialize or update the smoothed average time per item
    if (smoothedTimePerItem === 0) {
        smoothedTimePerItem = currentTimePerItem;
    } else {
        smoothedTimePerItem = (SMOOTHING_FACTOR * currentTimePerItem) + ((1 - SMOOTHING_FACTOR) * smoothedTimePerItem);
    }

    const remainingItems = total - done;
    return smoothedTimePerItem * remainingItems;
}
