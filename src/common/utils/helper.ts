function extractPhoneNumber(text: string) {
    text = text.replace(/o/gi, '0');
    text = text.replace(/[^0-9]/g, '');

    const validNetworkCodes = [
        '099', '098', '097', '096', '095', '094', '093', '092', '091', '090',
        '089', '088', '087', '086', '085', '083', '082',
        '081', '080', '079', '078', '077', '076', '075', '074',
        '073', '072', '071', '070', '069', '068', '067', '066',
        '065', '064', '063', '062', '061', '060',
        '059', '058', '057', '056', '055', '054', '053', '052', '051', '050',
        '039', '038', '037', '036', '035', '034', '033', '032', '031', '030'
    ];

    for (const code of validNetworkCodes) {
        const index = text.indexOf(code);
        if (index !== -1) {
            const phoneNumber = text.slice(index, index + 10);
            if (phoneNumber.length === 10) {
                return phoneNumber;
            }
        }
    }

    return null; 
}

export {
    extractPhoneNumber
}