// useDebouncedSearch.js
import { useState, useCallback } from 'react';
import { debounce } from 'lodash';

const useDebouncedSearch = (callback, delay = 1000) => {
  const [searchText, setSearchText] = useState('');

  const debouncedSearch = useCallback(
    debounce((text) => {
      setSearchText(text);
      callback(text);
    }, delay),
    []
  );

  const handleSearchTextChange = (text) => {
    debouncedSearch(text);
  };

  return { searchText, handleSearchTextChange };
};

export default useDebouncedSearch;
