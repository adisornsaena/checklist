import { useEffect, useState, createContext, useContext } from 'react';
import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { api, getToken, setToken } from './api.js';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import CaseList from './pages/CaseList.jsx';
import CaseForm from './pages/CaseForm.jsx';
import Users from './pages/Users.jsx';
import FormAdmin from './pages/FormAdmin.jsx';
import FormEditor from './pages/FormEditor.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import ChecklistIcon from './components/ChecklistIcon.jsx';
import Manual from './pages/Manual.jsx';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    if (!getToken()) return setReady(true);
    api('/auth/me').then(setUser).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);

  const login = (token, u) => { setToken(token); setUser(u); };
  const logout = () => { setToken(null); setUser(null); nav('/login'); };

  if (!ready) return <div className="center muted">กำลังโหลด...</div>;

  return (
    <AuthCtx.Provider value={{ user, login, logout }}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
        <Route path="/*" element={user ? <Shell /> : <Navigate to="/login" />} />
      </Routes>
    </AuthCtx.Provider>
  );
}

function Shell() {
  const { user, logout } = useAuth();
  return (
    <>
      <header className="topbar no-print">
        <Link to="/" className="brand"><img src="/okmd-logo.png" alt="okmd" className="brand-logo" /><span>Checklist Online</span></Link>
        <nav>
          <ChecklistIcon className="brand-icon" size={24} />
          <Link to="/">แบบฟอร์ม</Link>
          <Link to="/cases">รายการเอกสาร</Link>
          <Link to="/manual">คู่มือ</Link>
          {user.role === 'admin' && <Link to="/admin/forms">จัดการแบบฟอร์ม</Link>}
          {user.role === 'admin' && <Link to="/users">ผู้ใช้งาน</Link>}
        </nav>
        <div className="grow" />
        <Link to="/password" className="muted small" title="เปลี่ยนรหัสผ่าน">{user.displayName}{user.role === 'admin' ? ' (ผู้ดูแล)' : ''}</Link>
        <button className="btn ghost" onClick={logout}>ออกจากระบบ</button>
      </header>
      <main className="container">
        <Routes>
          <Route index element={<Home />} />
          <Route path="cases" element={<CaseList />} />
          <Route path="manual" element={<Manual />} />
          <Route path="admin/forms" element={user.role === 'admin' ? <FormAdmin /> : <Navigate to="/" />} />
          <Route path="admin/forms/new" element={user.role === 'admin' ? <FormEditor /> : <Navigate to="/" />} />
          <Route path="admin/forms/:code" element={user.role === 'admin' ? <FormEditor /> : <Navigate to="/" />} />
          <Route path="users" element={user.role === 'admin' ? <Users /> : <Navigate to="/" />} />
          <Route path="password" element={<ChangePassword />} />
          <Route path="cases/new/:code" element={<CaseForm />} />
          <Route path="cases/:id" element={<CaseForm />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </>
  );
}
