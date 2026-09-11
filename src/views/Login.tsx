import { useState } from 'react';
import { supabase, configured } from '../lib/supabase';

export function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [name, setName] = useState('');
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg('');
    if (mode === 'up') {
      const { error } = await supabase.auth.signUp({ email, password: pw, options: { data: { display_name: name.trim() } } });
      setMsg(error ? '注册失败：' + error.message : '注册成功。如果邮箱验证已开启，请先去邮箱点确认链接再登录。');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (error) setMsg('登录失败：' + error.message);
    }
    setBusy(false);
  };
  return (
    <div className="login">
      <div className="login-card">
        <div className="brand big"><span className="lanes"><i></i><i></i></span>平行线</div>
        <p className="muted">产品线与运营线并行的项目管理台</p>
        {!configured && <p className="hint warn">还没有配置 Supabase。复制 .env.example 为 .env 填入 URL 和 anon key 后重启。</p>}
        <form onSubmit={submit}>
          {mode === 'up' && <div className="f"><label>你的名字</label><input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="显示给协作者看" /></div>}
          <div className="f"><label>邮箱</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></div>
          <div className="f"><label>密码</label><input type="password" value={pw} onChange={e => setPw(e.target.value)} required minLength={6} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} /></div>
          {msg && <p className="hint">{msg}</p>}
          <button className="btn pri wide" type="submit" disabled={busy || !configured}>{mode === 'up' ? '注册' : '登录'}</button>
        </form>
        <p className="muted small">{mode === 'up' ? '已有账号？' : '第一次用？'} <a href="#" onClick={e => { e.preventDefault(); setMode(mode === 'up' ? 'in' : 'up'); setMsg(''); }}>{mode === 'up' ? '去登录' : '注册一个'}</a></p>
        <p className="muted small">被邀请的成员：用被邀请的那个邮箱注册，登录后自动进入工作区。</p>
      </div>
    </div>
  );
}
