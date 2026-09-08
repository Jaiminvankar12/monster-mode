function getServerToday() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
}

function validateDateAccess(dateStr) {
    const today = getServerToday();
    if (dateStr < today) return 'LOCKED';     // Previous days (Immutable)
    if (dateStr > today) return 'FUTURE';     // Future days (Not active)
    return 'UNLOCKED';                        // Today
}

module.exports = { getServerToday, validateDateAccess };