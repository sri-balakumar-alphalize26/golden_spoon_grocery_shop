import { useState, useCallback } from 'react';
import useLoader from './useLoader';

const useDataFetching = (fetchDataCallback) => {
  const [data, setData] = useState([]);
  const [loading, startLoading, stopLoading] = useLoader(false);
  const [allDataLoaded, setAllDataLoaded] = useState(false);
  // offset is the item offset (number of items to skip)
  const [offset, setOffset] = useState(0);

  const fetchData = useCallback(async (newFilters = {}) => {
    startLoading();
    try {
      const limit = newFilters.limit ?? 50;
      // fresh fetch: start at item offset 0
      const params = { offset: 0, limit, ...newFilters };
      const fetchedData = await fetchDataCallback(params);
      const list = fetchedData || [];
      setData(list);
      setAllDataLoaded(list.length < limit);
      setOffset(0);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      stopLoading();
    }
  }, [fetchDataCallback, startLoading, stopLoading]);

  const fetchMoreData = async (newFilters = {}) => {
    if (loading || allDataLoaded) return;
    startLoading();
    try {
      const limit = newFilters.limit ?? 50;
      const nextOffset = offset + limit;
      const params = { offset: nextOffset, limit, ...newFilters };
      const fetchedData = await fetchDataCallback(params);
      const list = fetchedData || [];
      if (list.length === 0) {
        setAllDataLoaded(true);
      } else {
        setData((prevData) => [...prevData, ...list]);
        setOffset(nextOffset);
        if (list.length < limit) setAllDataLoaded(true);
      }
    } catch (error) {
      console.error('Error fetching more data:', error);
    } finally {
      stopLoading();
    }
  };

  return { data, loading, fetchData, fetchMoreData };
};

export default useDataFetching;


