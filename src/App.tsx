import { useEffect, useState } from 'react';
import { useStore } from './state/store';
import { Login } from './views/Login';
import { Today } from './views/Today';
import { Board } from './views/Board';
import { Projects } from './views/Projects';
import { ProjectDetail } from './views/ProjectDetail';
import { Members } from './views/Members';
import { Inbox } from './views/Inbox';
import { Week } from './views/Week';
import { Clients } from './views/Clients';
import { ClientDetail } from './views/ClientDetail';
import { Files } from './views/Files';

type Route = { v: string; id?: string };
const parse = (): Route => { const h = location.hash.replace('#', '') || 'today'; return h.startsWith('p/') ? { v: 'project', id: h.slice(2) } : h.startsWith('c/') ? { v: 'client', id: h.slice(2) } : { v: h }; };

export function App() {
  const { ready, user, wsId, reminders, toastMsg, reload } = useStore();
  const [route, setRoute] = useState<Route>(parse());
  const [more, setMore] = useState(false);
  const [installEvt, setInstallEvt] = useState<(Event & { prompt: () => Promise<void> }) | null>(null);
  useEffect(() => {
    const f = (e: Event) => { e.preventDefault(); setInstallEvt(e as Event & { prompt: () => Promise<void> }); };
    window.addEventListener('beforeinstallprompt', f); return () => window.removeEventListener('beforeinstallprompt', f);
  }, []);
  useEffect(() => { const f = () => setRoute(parse()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  const unreadAll = user ? reminders.filter(r => r.to_user === user.id && !r.read).length : 0;
  useEffect(() => { try { (window as unknown as { parallelDesktop?: { setBadge: (n: number) => void } }).parallelDesktop?.setBadge(unreadAll); } catch { /* ignore */ } }, [unreadAll]);
  if (!ready) return <div className="center-screen muted">载入中…</div>;
  if (!user) return <Login />;
  if (!wsId) return <div className="center-screen"><p className="muted">正在准备你的工作区…</p><button className="btn" onClick={reload}>重试</button></div>;
  const unread = unreadAll;
  const nav: [string, string, string][] = [['today', '今天', '☀'], ['clients', '客户', '◎'], ['week', '本周', '▦'], ['board', '看板', '☰'], ['projects', '项目', '◫'], ['files', '文件', '▤'], ['inbox', '提醒', '◔'], ['members', '成员', '☺']];
  const mobileNav = nav.filter(([v]) => ['today', 'clients', 'board', 'inbox'].includes(v));
  const moreNav = nav.filter(([v]) => ['week', 'projects', 'files', 'members'].includes(v));
  const on = (v: string) => route.v === v || (route.v === 'project' && v === 'projects') || (route.v === 'client' && v === 'clients');
  return (
    <>
      <div className="top">
        <div className="brand"><span className="lanes"><i></i><i></i></span>平行线</div>
        <nav className="nav">{nav.map(([v, l]) => <a key={v} href={'#' + v} className={on(v) ? 'on' : ''}>{l}{v === 'inbox' && unread > 0 && <span className="badge">{unread}</span>}</a>)}</nav>
        <span className="spacer" />
        {installEvt && <button className="btn sm" onClick={async () => { await installEvt.prompt(); setInstallEvt(null); }}>安装应用</button>}
      </div>
      <main className="main">
        {route.v === 'clients' ? <Clients /> : route.v === 'client' ? <ClientDetail id={route.id!} /> : route.v === 'files' ? <Files /> : route.v === 'week' ? <Week /> : route.v === 'board' ? <Board /> : route.v === 'projects' ? <Projects /> : route.v === 'project' ? <ProjectDetail id={route.id!} /> : route.v === 'members' ? <Members /> : route.v === 'inbox' ? <Inbox /> : <Today />}
      </main>
      <nav className="tabbar">{mobileNav.map(([v, l, ic]) => <a key={v} href={'#' + v} className={on(v) ? 'on' : ''} onClick={() => setMore(false)}><span className="ic">{ic}</span>{l}{v === 'inbox' && unread > 0 && <span className="badge">{unread}</span>}</a>)}
        <a href="#" className={moreNav.some(([v]) => on(v)) ? 'on' : ''} onClick={e => { e.preventDefault(); setMore(m => !m); }}><span className="ic">⋯</span>更多</a>
        {more && <div className="more-sheet">{moreNav.map(([v, l, ic]) => <a key={v} href={'#' + v} onClick={() => setMore(false)}><span className="ic">{ic}</span>{l}</a>)}</div>}
      </nav>
      <div className={`toast ${toastMsg ? 'on' : ''}`}>{toastMsg}</div>
    </>
  );
}
