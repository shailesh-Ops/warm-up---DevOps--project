import { useState } from 'react';
import { ArrowRight, Inbox, LogOut, MessageCircle, MessageSquarePlus, Plus, Search, Settings2, Sparkles, Users, X } from 'lucide-react';
import { Avatar, Logo } from './Shared';
import { chatColor, chatName, conversationTime, partner } from '../lib/format';

function ConversationItem({ conversation, me, active, onClick }) {
  const name = chatName(conversation, me.id);
  const other = partner(conversation, me.id);
  const isGroup = conversation.kind === 'group';
  const last = conversation.lastMessage;
  const snippet = last ? `${last.senderId === me.id ? 'You: ' : isGroup ? `${last.senderName.split(' ')[0]}: ` : ''}${last.body}` : 'Say hello 👋';
  return <button type="button" onClick={onClick} className={`conversation-item group flex w-full items-center gap-3 rounded-[17px] px-3 py-3.5 text-left ${active ? 'bg-[#f0edff] shadow-sm' : 'hover:bg-slate-50'}`}>
    <div className="relative flex-none"><Avatar name={name} color={chatColor(conversation, me.id)} size="lg" square={isGroup} online={!isGroup && other?.online}/></div>
    <div className="min-w-0 flex-1"><div className="mb-1 flex items-start justify-between gap-2"><h3 className={`truncate text-[13.5px] font-extrabold ${active ? 'text-violet-900' : 'text-slate-800'}`}>{name}</h3><span className="shrink-0 pt-0.5 text-[10px] font-medium text-slate-400">{conversationTime(last?.createdAt || conversation.updatedAt)}</span></div>
      <div className="flex items-center justify-between gap-2"><p className={`truncate text-[12px] leading-5 ${conversation.unreadCount ? 'font-bold text-slate-700' : 'text-slate-400'}`}>{snippet}</p>{conversation.unreadCount > 0 && <span className="grid h-5 min-w-5 flex-none place-items-center rounded-full bg-violet-600 px-1 text-[10px] font-extrabold text-white">{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</span>}</div>
    </div>
  </button>;
}

export default function Sidebar({ user, conversations, selectedId, onSelect, onNewChat, onProfile, onLogout, mobileHidden }) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('all');
  const filtered = conversations.filter(c => (tab === 'all' || c.unreadCount > 0) && chatName(c, user.id).toLowerCase().includes(query.toLowerCase()));
  const unread = conversations.reduce((n, c) => n + (c.unreadCount > 0 ? 1 : 0), 0);
  return <div className={`sidebar-shell ${mobileHidden ? 'hidden lg:flex' : 'flex'} h-full w-full flex-none bg-white lg:w-[368px]`}>
    <aside className="hidden w-[76px] flex-none flex-col items-center justify-between border-r border-slate-100 bg-[#fbfbfe] py-7 lg:flex">
      <div className="flex flex-col items-center gap-10"><Logo compact/><div className="flex flex-col gap-4"><span className="rail-icon rail-icon-active" title="Messages" aria-label="Messages"><MessageCircle size={22}/></span><button className="rail-icon" onClick={onNewChat} title="New conversation" aria-label="New conversation"><Users size={22}/></button></div></div>
      <div className="flex flex-col items-center gap-4"><button onClick={onProfile} className="rail-icon" title="Your profile" aria-label="Your profile"><Settings2 size={20}/></button><button type="button" onClick={onLogout} className="rail-icon hover:text-rose-600" title="Sign out" aria-label="Sign out"><LogOut size={20}/></button><button onClick={onProfile} aria-label="Edit your profile"><Avatar name={user.name} color={user.avatarColor} size="sm"/></button></div>
    </aside>
    <div className="flex h-full min-w-0 flex-1 flex-col border-r border-slate-100">
      <div className="px-5 pb-4 pt-7 sm:px-6">
        <div className="mb-8 flex items-center justify-between gap-2 lg:hidden"><Logo/><div className="flex items-center gap-2"><button className="icon-button" onClick={onProfile} title="Profile"><Avatar name={user.name} color={user.avatarColor} size="xs"/></button><button onClick={onLogout} className="icon-button" title="Sign out"><LogOut size={18}/></button></div></div>
        <div className="mb-5 flex items-center justify-between"><div><p className="mb-1 text-xs font-bold tracking-[.08em] text-violet-500">YOUR SPACE</p><h1 className="font-display text-[27px] font-extrabold leading-tight tracking-[-.06em] text-slate-900">Messages<span className="ml-2 text-violet-500">.</span></h1></div><button onClick={onNewChat} className="grid h-11 w-11 place-items-center rounded-[14px] bg-violet-600 text-white shadow-lg shadow-violet-200 transition hover:-translate-y-0.5 hover:bg-violet-700" title="New conversation" aria-label="New conversation"><MessageSquarePlus size={20}/></button></div>
        <div className="relative"><Search size={18} className="input-leading-icon"/><input className="sidebar-search" aria-label="Search conversations" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search conversations..."/>{query && <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" onClick={() => setQuery('')} aria-label="Clear search"><X size={15}/></button>}</div>
      </div>
      <div className="mx-5 flex items-center gap-6 border-b border-slate-100 px-1 sm:mx-6"><button onClick={() => setTab('all')} className={`tab-button ${tab === 'all' ? 'tab-selected' : ''}`}>All chats <span className="ml-1 text-[11px] opacity-60">{conversations.length}</span></button><button onClick={() => setTab('unread')} className={`tab-button ${tab === 'unread' ? 'tab-selected' : ''}`}>Unread {unread > 0 && <span className="ml-1 rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-600">{unread}</span>}</button></div>
      <div className="chat-scroll flex-1 space-y-1 overflow-y-auto px-3 py-3 sm:px-4">
        {filtered.map(c => <ConversationItem key={c.id} conversation={c} me={user} active={selectedId === c.id} onClick={() => onSelect(c.id)}/>)}
        {!filtered.length && <div className="flex flex-col items-center px-4 pb-9 pt-14 text-center"><div className="mb-4 rounded-[22px] bg-violet-50 p-5 text-violet-500">{tab === 'unread' ? <Inbox size={29}/> : <MessageCircle size={29}/>}</div><h3 className="font-display font-extrabold text-slate-800">{query ? 'No matches found' : tab === 'unread' ? 'All caught up!' : 'No conversations yet'}</h3><p className="mt-2 max-w-[210px] text-xs leading-6 text-slate-400">{query ? 'Try another name.' : tab === 'unread' ? 'All your conversations are read.' : 'Start a new conversation and make something happen.'}</p>{!query && tab === 'all' && <button onClick={onNewChat} className="mt-5 text-xs font-extrabold text-violet-600">Find your people →</button>}</div>}
      </div>
      <div className="hidden border-t border-slate-100 p-4 sm:block"><div className="flex items-center gap-3 rounded-[16px] bg-gradient-to-r from-violet-50 to-fuchsia-50 px-3 py-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-violet-600 shadow-sm"><Sparkles size={17}/></span><div className="min-w-0"><p className="truncate text-xs font-extrabold text-slate-800">Better together</p><p className="text-[11px] text-slate-500">Connect with your people.</p></div></div></div>
    </div>
  </div>;
}
