import { useState, useCallback, useRef } from 'react';
import Toast from 'react-native-toast-message';
import useLoader from './useLoader';

const defaultGetKey = (item) => (item ? item.id : null);

const dedupeBy = (items, getKey) => {
  const seen = new Set();
  const out = [];
  for (const it of items || []) {
    if (it == null) continue;
    const k = getKey(it);
    if (k === undefined || k === null || k === '') {
      out.push(it);
      continue;
    }
    const key = String(k);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
};

const useDataFetching = (fetchDataCallback, options = {}) => {
  const getDedupeKey = options.getDedupeKey || defaultGetKey;
  const [data, setData] = useState([]);
  const [loading, startLoading, stopLoading] = useLoader(false);
  const [allDataLoaded, setAllDataLoaded] = useState(false);
  // offset is the item offset (number of items to skip)
  const [offset, setOffset] = useState(0);
  // After a pagination error we briefly suppress retries so onEndReached
  // doesn't hammer the network, then the next scroll attempt resumes.
  const cooldownUntilRef = useRef(0);

  const fetchData = useCallback(async (newFilters = {}) => {
    startLoading();
    try {
      const limit = newFilters.limit ?? 50;
      // fresh fetch: start at item offset 0
      const params = { offset: 0, limit, ...newFilters };
      const fetchedData = await fetchDataCallback(params);
      const list = fetchedData || [];
      setData(dedupeBy(list, getDedupeKey));
      setAllDataLoaded(list.length < limit);
      setOffset(0);
    } catch (error) {
      console.error('Error fetching data:', error);
      Toast.show({
        type: 'error',
        text1: 'Could not load',
        text2: (error?.message || '').slice(0, 80),
        position: 'bottom',
      });
    } finally {
      stopLoading();
    }
  }, [fetchDataCallback, startLoading, stopLoading]);

  const fetchMoreData = async (newFilters = {}) => {
    if (loading || allDataLoaded) return;
    if (Date.now() < cooldownUntilRef.current) return;
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
        setData((prevData) => {
          const existing = new Set(
            prevData
              .map((p) => {
                const k = getDedupeKey(p);
                return k != null && k !== '' ? String(k) : null;
              })
              .filter(Boolean)
          );
          const fresh = list.filter((p) => {
            if (p == null) return false;
            const k = getDedupeKey(p);
            if (k == null || k === '') return true;
            return !existing.has(String(k));
          });
          return [...prevData, ...fresh];
        });
        setOffset(nextOffset);
        if (list.length < limit) setAllDataLoaded(true);
      }
    } catch (error) {
      console.error('Error fetching more data:', error);
      // Brief cooldown so onEndReached doesn't tight-loop on a transient
      // error. The next scroll attempt after the window will retry.
      cooldownUntilRef.current = Date.now() + 1500;
      Toast.show({
        type: 'error',
        text1: 'Could not load more',
        text2: (error?.message || '').slice(0, 80),
        position: 'bottom',
      });
    } finally {
      stopLoading();
    }
  };

  return { data, loading, fetchData, fetchMoreData };
};

export default useDataFetching;


