import { useState, useEffect } from 'react';

export function useLiveQuery(queryFn, deps = [], fallback = undefined) {
  const [result, setResult] = useState(fallback);

  useEffect(() => {
    let cancelled = false;
    queryFn().then((data) => {
      if (!cancelled) setResult(data);
    });
    return () => { cancelled = true; };
  }, deps);

  return result;
}
