import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, MessageCircle, ShieldCheck, Sparkles, Users, Zap } from 'lucide-react';
import { api } from '../lib/api';
import { Avatar, Logo } from './Shared';

export default function AuthScreen({ onAuthenticated, serverNotice = '', onRetry }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const register = mode === 'register';
  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const result = await api(register ? '/register' : '/login', { method:'POST', body: register ? { name, email, password } : { email, password } });
      onAuthenticated(result.user);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const swap = () => { setMode(register ? 'login' : 'register'); setError(''); };
  return <main className="auth-screen min-h-screen lg:grid lg:grid-cols-[51%_49%]">
    <div className="relative flex min-h-screen flex-col bg-white px-6 py-7 sm:px-12 lg:px-[max(3rem,9%)] lg:py-10">
      <Logo />
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-14">
        <span className="mb-5 inline-flex w-fit items-center gap-2 rounded-full bg-violet-50 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-violet-600"><Sparkles size={13}/> A better way to connect</span>
        <h1 className="font-display text-[clamp(2.1rem,4vw,3.1rem)] font-extrabold leading-[1.16] tracking-[-0.065em] text-slate-900">{register ? 'Your people are waiting.' : 'Welcome back.'}</h1>
        <p className="mt-3 text-[15px] leading-7 text-slate-500">{register ? 'Create your space. Start conversations that matter.' : 'Pick up right where the conversation left off.'}</p>
        <form onSubmit={submit} className="mt-9 space-y-5">
          {register && <div><label htmlFor="full-name" className="field-label">Full name</label><input id="full-name" className="input-field" autoComplete="name" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={60}/></div>}
          <div><label htmlFor="email" className="field-label">Email address</label>
            <div className="relative"><Mail size={18} className="input-leading-icon" /><input id="email" className="input-field pl-12" type="email" placeholder="you@example.com" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></div></div>
          <div><div className="flex items-center justify-between"><label htmlFor="password" className="field-label">Password</label>{register && <span className="mb-2 text-xs text-slate-400">At least 10 characters</span>}</div>
            <div className="relative"><LockKeyhole size={18} className="input-leading-icon" /><input id="password" className="input-field pl-12 pr-12" type={visible ? 'text' : 'password'} placeholder="Enter your password" autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} minLength={register ? 10 : 1} maxLength={128} required />
              <button className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:text-slate-700" type="button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(v => !v)}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></div>
          {serverNotice && !error && <div role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{serverNotice}{onRetry && <button type="button" onClick={onRetry} className="ml-2 font-bold underline">Try again</button>}</div>}
          {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{error}</p>}
          <button type="submit" disabled={busy} className="primary-button mt-1 w-full justify-center py-[15px] text-[15px]">{busy ? 'One moment…' : register ? 'Create your account' : 'Sign in to Orbit'} <ArrowRight size={18}/></button>
        </form>
        <p className="mt-7 text-center text-sm text-slate-500">{register ? 'Already part of Orbit?' : 'New around here?'} <button type="button" onClick={swap} className="font-bold text-violet-600 hover:text-violet-800">{register ? 'Sign in' : 'Create an account'}</button></p>
      </div>
      <p className="text-center text-xs text-slate-400 lg:text-left">© {new Date().getFullYear()} Orbit · Made for meaningful conversations</p>
    </div>
    <div className="auth-visual relative hidden flex-col justify-between overflow-hidden p-[clamp(2rem,4vw,4.5rem)] text-white lg:flex">
      <div className="auth-orb auth-orb-one"/><div className="auth-orb auth-orb-two"/>
      <div className="relative z-10 inline-flex w-fit items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-semibold tracking-wide backdrop-blur-sm"><span className="h-2 w-2 rounded-full bg-lime-300"/> REAL CONNECTIONS. REAL TIME.</div>
      <div className="relative z-10 mx-auto w-full max-w-[460px] -translate-y-2">
        <div className="auth-preview rounded-[28px] border border-white/30 bg-white p-6 text-slate-900 shadow-2xl shadow-violet-950/20 sm:p-7">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-5"><Avatar name="Alex Morgan" color="#E88F80" size="md" online/><div className="flex-1"><p className="font-display font-extrabold">Alex Morgan</p><p className="text-xs font-medium text-emerald-600">● Online now</p></div><MessageCircle size={21} className="text-violet-500"/></div>
          <div className="space-y-4 pt-6"><div className="flex gap-2.5"><Avatar name="Alex Morgan" color="#E88F80" size="xs"/><div className="max-w-[77%] rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3 text-[13px] font-medium leading-6 text-slate-600">Hey! So glad we could connect here ✨</div></div>
            <div className="flex justify-end"><div className="max-w-[79%] rounded-2xl rounded-br-sm bg-[#7365e8] px-4 py-3 text-[13px] font-medium leading-6 text-white">Me too! Everything feels so effortless 💜</div></div>
            <div className="flex gap-2.5"><Avatar name="Alex Morgan" color="#E88F80" size="xs"/><div className="rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-2 text-base tracking-widest text-violet-400">•••</div></div>
          </div>
          <div className="mt-6 flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3"><span className="text-xs text-slate-400">Type a message...</span><span className="rounded-xl bg-violet-600 p-2 text-white"><ArrowRight size={16}/></span></div>
        </div>
        <div className="absolute -bottom-5 -left-7 flex items-center gap-2.5 rounded-2xl border border-white/70 bg-white px-4 py-3 text-slate-800 shadow-xl"><span className="rounded-xl bg-emerald-50 p-2 text-emerald-500"><Zap size={18}/></span><span className="text-[12px] font-extrabold">Messages in real time</span></div>
      </div>
      <div className="relative z-10 flex items-end justify-between gap-6"><div><p className="font-display text-3xl font-extrabold leading-tight tracking-[-0.04em]">Closer, even<br/>from afar.</p><p className="mt-2 max-w-[340px] text-sm leading-6 text-white/70">Your favorite people, all in one beautiful place.</p></div><div className="flex -space-x-2"><Avatar name="Kim" color="#EC9079" size="sm" className="ring-[3px] ring-violet-500"/><Avatar name="Sam" color="#55AB9D" size="sm" className="ring-[3px] ring-violet-500"/><Avatar name="Jo" color="#D6A64F" size="sm" className="ring-[3px] ring-violet-500"/></div></div>
    </div>
  </main>;
}
