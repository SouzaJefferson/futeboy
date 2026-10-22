import { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
export function useResource<T>(path: string) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion(v => v + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    api<T>(path).then(value => { if (active) setData(value); }).catch(e => { if (active) setError(e.message || 'Falha de conexão.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [path, version]);
  return { data, error, loading, reload };
}
