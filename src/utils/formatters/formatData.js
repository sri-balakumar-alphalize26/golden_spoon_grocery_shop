
export const formatData = (dataList, numColumns) => {
    const totalRows = Math.ceil(dataList.length / numColumns); //total rows = 20/3 = 7
    const totalItems = totalRows * numColumns; //total items = 7 * 3 = 21
    const formattedData = [...dataList];
    if (dataList.length < totalItems) {
        const emptyItemCount = totalItems - dataList.length; // empty items count = 21 - 20
        for (let i = 0; i < emptyItemCount; i++) {
            formattedData.push({ key: 'blank', empty: true });
        }
    }
    return formattedData;
};
