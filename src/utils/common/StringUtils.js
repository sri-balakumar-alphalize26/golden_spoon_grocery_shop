// StringUtils.js
const truncateString = (str, maxLength) => {
    return str.length > maxLength ? str?.trim().slice(0, maxLength) + '...' : str.trim();
};

export { truncateString };
