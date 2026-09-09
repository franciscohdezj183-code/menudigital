import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { getCurrentUser, login as loginRequest, logout as logoutRequest } from '../../services/api.js';
import { themeStyle } from '../../utils/theme.js';
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
export default function AuthProvider() {
  const [state, setState] = useState({ status: 'loading', user: null, business: null });
  const pending = useRef(null);
  const generation = useRef(0);
  const clearSession = useCallback(() => { generation.current++; pending.current?.abort(); setState({ status: 'anonymous', user: null, business: null }); }, []);
  const refreshSession = useCallback(async () => {
    const version = ++generation.current;
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setState({ status: 'loading', user: null, business: null });
    try {
      const data = await getCurrentUser({ signal: controller.signal });
      if (version !== generation.current || controller.signal.aborted) return;
      if (!data?.ok || !data.user || !data.business) throw new Error('Invalid response');
      setState({ status: 'authenticated', user: data.user, business: data.business });
    } catch (error) {
      if (version !== generation.current || controller.signal.aborted) return;
      setState({ status: [401, 403].includes(error.status) ? 'anonymous' : 'error', user: null, business: null });
    }
  }, []);
  useEffect(() => { refreshSession(); return () => { generation.current++; pending.current?.abort(); }; }, [refreshSession]);
  const login = async (email, password) => {
    const version = ++generation.current;
    pending.current?.abort();
    const data = await loginRequest(email, password);
    if (version !== generation.current) return;
    if (!data?.ok || !data.user || !data.business) throw new Error('Invalid response');
    setState({ status: 'authenticated', user: data.user, business: data.business });
  };
  const logout = async () => { await logoutRequest(); clearSession(); };
  return <AuthContext.Provider value={{ ...state, authenticated: state.status === 'authenticated', login, logout, refreshSession, clearSession }}><div style={themeStyle(state.business?.theme_color)}><Outlet /></div></AuthContext.Provider>;
}
