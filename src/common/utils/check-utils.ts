function isNumeric(str: string) {
    return /^\d+$/.test(str);
}

export {
    isNumeric
}