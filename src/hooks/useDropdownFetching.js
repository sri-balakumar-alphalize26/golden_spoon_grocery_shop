import { useState, useCallback } from 'react';

const useDropdownFetching = (fetchDataCallback) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // const params = { offset: 0, limit: 20, search };
            const fetchedData = await fetchDataCallback();
            setData(fetchedData);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    }, [fetchDataCallback]);

    return { data, loading, fetchData };
};

export default useDropdownFetching;
