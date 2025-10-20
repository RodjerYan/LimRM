export const formatETR = (seconds: number): string => {
    if (seconds === Infinity || isNaN(seconds) || seconds < 0) {
        return 'Расчет времени...';
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `~ ${String(minutes).padStart(1, '0')}:${String(remainingSeconds).padStart(2, '0')} до завершения`;
};