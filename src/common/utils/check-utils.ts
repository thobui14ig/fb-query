function isNumeric(str: string) {
    return /^\d+$/.test(str);
}

function isAlpha(str: string): boolean {
    return /^[A-Za-z]+$/.test(str);
}

export {
    isNumeric, isAlpha
}