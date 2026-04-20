import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Activity, LayoutDashboard, ListTodo, Shield, Settings as SettingsIcon, Package } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Tasks from './pages/Tasks';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-background text-text font-sans">
      <aside className="w-64 border-r border-border bg-surface flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <Shield className="w-8 h-8 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">NullBunny</h1>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-2">
          <NavLink to="/" icon={<LayoutDashboard />} label="仪表盘" />
          <NavLink to="/tasks" icon={<ListTodo />} label="任务中心" />
          <NavLink to="/reports" icon={<Activity />} label="报告中心" />
          <NavLink to="/marketplace" icon={<Package />} label="扩展市场" />
        </nav>
        <div className="p-4 border-t border-border">
          <NavLink to="/settings" icon={<SettingsIcon />} label="系统设置" />
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-8">
        {children}
      </main>
    </div>
  );
}

function NavLink({ to, icon, label }: { to: string, icon: React.ReactNode, label: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-surfaceHover transition-colors text-textMuted hover:text-text">
      {React.cloneElement(icon as React.ReactElement, { className: 'w-5 h-5' })}
      <span className="font-medium">{label}</span>
    </Link>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tasks/*" element={<Tasks />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/marketplace" element={<div>Marketplace (Coming Soon)</div>} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;