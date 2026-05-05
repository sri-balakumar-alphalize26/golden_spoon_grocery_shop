import { useState, useRef } from 'react';

const MINIMUM_LOADER_TIME = 1000; // Minimum loader display time in milliseconds

const useLoader = (initialLoading = false) => {
  const [loading, setLoading] = useState(initialLoading);
  const startTime = useRef(null);

  const startLoading = () => {
    startTime.current = Date.now();
    setLoading(true);
  };

  const stopLoading = () => {
    const elapsed = Date.now() - startTime.current;
    if (elapsed < MINIMUM_LOADER_TIME) {
      setTimeout(() => {
        setLoading(false);
      }, MINIMUM_LOADER_TIME - elapsed);
    } else {
      setLoading(false);
    }
  };

  return [loading, startLoading, stopLoading];
};

export default useLoader;
