import { useEffect, useState } from 'react';
import { Check, MessageCircle, Search, Users, UserRound, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { Avatar, Modal } from './Shared';

export function NewChatDialog({ onClose, onCreated }) {
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState([]);
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try { const result = await api(`/users?search=${encodeURIComponent(query)}`); if (active) setPeople(result.users); }
      catch (e) { if (active) setError(e.message); }
    }, 220);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);
  function toggle(person) { setSelected(prev => prev.some(p => p.id === person.id) ? prev.filter(p => p.id !== person.id) : [...prev, person]); }
  async function create() {
    setError(''); setBusy(true);
    try {
      const body = selected.length === 1 ? { kind:'direct', userId:selected[0].id } : { kind:'group', name:groupName.trim(), userIds:selected.map(p => p.id) };
      const { conversationId } = await api('/conversations', { method:'POST', body });
      await onCreated(conversationId);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <Modal title="Start a conversation" onClose={onClose} width="max-w-lg">
    <div className="relative"><Search size={18} className="input-leading-icon"/><input autoFocus value={query} onChange={e => setQuery(e.target.value)} className="input-field pl-11" placeholder="Find people by name or email" aria-label="Find people"/></div>
    {selected.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{selected.map(p => <button key={p.id} type="button" onClick={() => toggle(p)} className="flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1.5 text-xs font-bold text-violet-700">{p.name}<span aria-hidden>×</span></button>)}</div>}
    <div className="mt-5 mb-2 flex items-center justify-between"><span className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-400">People on Orbit</span><span className="text-xs text-slate-400">{selected.length} selected</span></div>
    <div className="max-h-[250px] space-y-1 overflow-auto pr-1">
      {!people.length && <p className="py-9 text-center text-sm text-slate-400">No people found. Invite someone to sign up!</p>}
      {people.map(person => { const checked = selected.some(p => p.id === person.id); return <button key={person.id} type="button" onClick={() => toggle(person)} className={`flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition hover:bg-slate-50 ${checked ? 'bg-violet-50' : ''}`}>
        <Avatar name={person.name} color={person.avatarColor} size="sm" online={person.online}/><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-800">{person.name}</span><span className="block truncate text-xs text-slate-400">{person.status || 'Available to chat'}</span></span>
        <span className={`grid h-5 w-5 place-items-center rounded-md border ${checked ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300'}`}>{checked && <Check size={13}/>}</span></button>; })}
    </div>
    {selected.length > 1 && <div className="mt-5"><label htmlFor="group-name" className="field-label">Group name</label><div className="relative"><Users size={18} className="input-leading-icon"/><input id="group-name" value={groupName} maxLength={80} onChange={e => setGroupName(e.target.value)} className="input-field pl-11" placeholder="e.g. The dream team"/></div></div>}
    {error && <p role="alert" className="mt-4 text-sm font-medium text-rose-500">{error}</p>}
    <button type="button" onClick={create} disabled={busy || selected.length === 0 || (selected.length > 1 && groupName.trim().length < 2)} className="primary-button mt-6 w-full justify-center py-3.5"><MessageCircle size={17}/>{busy ? 'Starting…' : selected.length > 1 ? 'Create group' : 'Start chatting'}</button>
    <p className="mt-3 text-center text-xs text-slate-400">Choose one person for a direct chat, or multiple for a group.</p>
  </Modal>;
}

export function ProfileDialog({ user, onClose, onSaved }) {
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio || '');
  const [status, setStatus] = useState(user.status || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function save(e) {
    e.preventDefault(); setSaving(true); setError('');
    try { const { user: updated } = await api('/me', { method:'PATCH', body:{ name, bio, status } }); onSaved(updated); onClose(); }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }
  return <Modal title="Your profile" onClose={onClose}>
    <div className="mb-7 flex flex-col items-center rounded-2xl bg-violet-50/80 py-7"><Avatar name={name || user.name} color={user.avatarColor} size="xl"/><span className="mt-3 font-display text-lg font-extrabold text-slate-900">{name || user.name}</span><span className="text-xs text-slate-500">{user.email}</span></div>
    <form onSubmit={save} className="space-y-4"><div><label htmlFor="profile-name" className="field-label">Display name</label><input id="profile-name" required minLength={2} maxLength={60} className="input-field" value={name} onChange={e => setName(e.target.value)}/></div>
      <div><label htmlFor="profile-status" className="field-label">Status</label><input id="profile-status" maxLength={100} className="input-field" value={status} onChange={e => setStatus(e.target.value)} placeholder="What are you up to?"/></div>
      <div><label htmlFor="profile-bio" className="field-label">A little about you</label><textarea id="profile-bio" maxLength={180} rows={3} className="input-field resize-none" value={bio} onChange={e => setBio(e.target.value)} placeholder="Write a short bio..."/></div>
      {error && <p role="alert" className="text-sm text-rose-500">{error}</p>}
      <button type="submit" disabled={saving} className="primary-button w-full justify-center py-3.5">{saving ? 'Saving…' : 'Save changes'}</button></form>
  </Modal>;
}

export function ConfirmLeaveDialog({ name, onClose, onConfirm, busy }) {
  return <Modal title="Leave this group?" onClose={onClose}>
    <div className="flex gap-3 rounded-xl bg-amber-50 p-4 text-amber-800"><AlertTriangle size={20} className="flex-none"/><p className="text-sm leading-6">You will lose access to <strong>{name}</strong> and its chat history. Other members will stay in the group.</p></div>
    <div className="mt-6 flex justify-end gap-3"><button onClick={onClose} className="secondary-button">Cancel</button><button onClick={onConfirm} disabled={busy} className="rounded-xl bg-rose-600 px-5 py-3 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50">{busy ? 'Leaving…' : 'Leave group'}</button></div>
  </Modal>;
}
