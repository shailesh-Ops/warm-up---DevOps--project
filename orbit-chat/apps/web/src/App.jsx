import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { ArrowRight, BellOff, MessageCircleHeart, MessageSquareText, Plus, Search, Sparkles, WifiOff, X } from 'lucide-react';
import { API_URL, api } from './lib/api';
import AuthScreen from './components/AuthScreen';
import Sidebar from './components/Sidebar';
import { Avatar, Loading, Logo } from './components/Shared';
import { ChatHeader, ChatTimeline, Composer, ConversationInfo } from './components/ChatPanel';
import { ConfirmLeaveDialog, NewChatDialog, ProfileDialog } from './components/Dialogs';
import { chatName } from './lib/format';

function EmptyWorkspace({ name, onNewChat }) {
  return <div className="relative flex h-full flex-1 flex-col items-center justify-center overflow-hidden bg-[#fafbff] px-6 text-center">
    <div className="empty-decor empty-decor-one"/><div className="empty-decor empty-decor-two"/>
    <div className="relative z-10 mb-9 flex h-[126px] w-[126px] items-center justify-center rounded-[40px] bg-white shadow-[0_25px_80px_rgba(101,87,221,.16)] ring-1 ring-violet-100"><span className="grid h-[82px] w-[82px] place-items-center rounded-[28px] bg-gradient-to-br from-[#7768f4] to-[#a78bfa] text-white"><MessageCircleHeart size={39} strokeWidth={1.8}/></span><span className="absolute -right-4 -top-3 grid h-10 w-10 place-items-center rounded-2xl bg-[#ffc66c] text-white shadow-md"><Sparkles size={20}/></span></div>
    <div className="relative z-10 max-w-sm"><span className="mb-3 block text-xs font-extrabold uppercase tracking-[.2em] text-violet-500">Your conversations, your space</span><h2 className="font-display text-[clamp(1.8rem,3vw,2.5rem)] font-extrabold leading-tight tracking-[-.07em] text-slate-900">Good things start<br/>with a hello<span className="text-violet-500">.</span></h2><p className="mx-auto mt-4 max-w-[300px] text-[14px] leading-7 text-slate-500">Hi {name.split(' ')[0]}! Pick a chat from the left or start something new with your favorite people.</p><button onClick={onNewChat} className="primary-button mx-auto mt-7 px-6 py-3.5">Start a conversation <ArrowRight size={17}/></button></div>
    <p className="absolute bottom-8 text-[11px] font-medium text-slate-300">A little connection goes a long way ✦</p>
  </div>;
}

function ChatWorkspace({ user, setUser }) {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [messageSearch, setMessageSearch] = useState('');
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [typing, setTyping] = useState({});
  const [connection, setConnection] = useState('connecting');
  const [error, setError] = useState('');
  const socketRef = useRef(null);
  const activeRef = useRef(null);
  const typingTimers = useRef(new Map());
  const selected = conversations.find(c => c.id === selectedId);

  const refreshConversations = useCallback(async () => {
    try { const { conversations: items } = await api('/conversations'); setConversations(items); }
    catch (e) { if (e.status === 401) setUser(null); else setError(e.message); }
  }, [setUser]);
  const readConversation = useCallback(async id => {
    try { await api(`/conversations/${id}/read`, { method:'POST' }); }
    catch { /* UI stays usable during a transient read-marker error */ }
  }, []);
  const upsertMessage = useCallback(message => {
    if (!message || activeRef.current !== message.conversationId) return;
    setMessages(prev => prev.some(m => m.id === message.id) ? prev.map(m => m.id === message.id ? message : m) : [...prev, message]);
  }, []);
  useEffect(() => {
    refreshConversations();
    const socket = io(API_URL, { withCredentials:true, transports:['websocket', 'polling'], reconnection:true });
    socketRef.current = socket;
    socket.on('connect', async () => {
      setConnection('online'); refreshConversations();
      const id = activeRef.current;
      if (id) {
        socket.emit('conversation:join', id);
        try {
          const { messages: latest } = await api(`/conversations/${id}/messages`);
          if (activeRef.current === id) setMessages(prev => [...new Map([...prev, ...latest].map(m => [m.id, m])).values()].sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt) || a.id.localeCompare(b.id)));
          await readConversation(id);
        } catch { /* the conversation might have been left */ }
      }
    });
    socket.on('disconnect', () => setConnection('offline'));
    socket.on('connect_error', () => setConnection('offline'));
    socket.on('conversation:created', () => refreshConversations());
    socket.on('profile:changed', () => refreshConversations());
    socket.on('profile:updated', updated => setUser(updated));
    socket.on('conversation:updated', () => refreshConversations());
    socket.on('conversation:removed', ({ conversationId }) => {
      if (activeRef.current === conversationId) { activeRef.current = null; setSelectedId(null); setDetailsOpen(false); }
      refreshConversations();
    });
    socket.on('message:new', message => {
      upsertMessage(message);
      refreshConversations();
      if (activeRef.current === message.conversationId && message.senderId !== user.id) readConversation(message.conversationId);
    });
    socket.on('message:updated', upsertMessage);
    socket.on('conversation:read', ({ conversationId, userId, lastReadAt }) => {
      setConversations(prev => prev.map(c => c.id !== conversationId ? c : { ...c, members:c.members.map(m => m.id === userId ? { ...m, lastReadAt } : m) }));
    });
    socket.on('typing:changed', ({ conversationId, userId, typing: isTyping }) => {
      if (userId === user.id || conversationId !== activeRef.current) return;
      setTyping(prev => ({ ...prev, [userId]:isTyping }));
      const old = typingTimers.current.get(userId);
      if (old) clearTimeout(old);
      if (isTyping) typingTimers.current.set(userId, setTimeout(() => setTyping(prev => ({ ...prev, [userId]:false })), 3500));
    });
    socket.on('presence:changed', ({ userId, online, lastSeenAt }) => {
      setConversations(prev => prev.map(c => ({ ...c, members:c.members.map(m => m.id === userId ? { ...m, online, lastSeenAt:lastSeenAt || m.lastSeenAt } : m) })));
    });
    return () => { socket.disconnect(); socketRef.current = null; for (const t of typingTimers.current.values()) clearTimeout(t); typingTimers.current.clear(); };
  }, [refreshConversations, readConversation, upsertMessage, user.id]);

  useEffect(() => {
    activeRef.current = selectedId;
    setTyping({}); setMessages([]); setHasMore(false); setDetailsOpen(false); setSearchOpen(false); setMessageSearch('');
    if (!selectedId) return;
    let cancelled = false;
    async function init() {
      setLoadingMessages(true);
      try {
        const data = await api(`/conversations/${selectedId}/messages`);
        if (!cancelled) { setMessages(data.messages); setHasMore(data.hasMore); }
        socketRef.current?.emit('conversation:join', selectedId);
        await readConversation(selectedId);
        refreshConversations();
      } catch (e) { if (!cancelled) setError(e.message); }
      finally { if (!cancelled) setLoadingMessages(false); }
    }
    init();
    return () => { cancelled = true; };
  }, [selectedId, readConversation, refreshConversations]);

  async function loadMore() {
    if (!selectedId || !hasMore || !messages.length) return;
    const id = selectedId;
    const { messages: older, hasMore: more } = await api(`/conversations/${id}/messages?before=${encodeURIComponent(messages[0].id)}`);
    if (activeRef.current !== id) return;
    setMessages(prev => [...older.filter(m => !prev.some(p => p.id === m.id)), ...prev]);
    setHasMore(more);
    return older.length;
  }
  async function send(body) {
    if (!selectedId) return;
    const id = selectedId;
    const { message } = await api(`/conversations/${id}/messages`, { method:'POST', body:{ body } });
    upsertMessage(message);
    refreshConversations();
  }
  async function createConversation(conversationId) {
    await refreshConversations();
    setCreateOpen(false); activeRef.current = conversationId; setSelectedId(conversationId);
    socketRef.current?.emit('conversation:join', conversationId);
  }
  async function signOut() {
    try { await api('/auth/logout', { method:'POST' }); socketRef.current?.disconnect(); setUser(null); }
    catch (e) { setError(e.message); }
  }
  async function leaveGroup() {
    if (!selectedId) return;
    setLeaveBusy(true);
    try { await api(`/conversations/${selectedId}/members/me`, { method:'DELETE' }); activeRef.current = null; setSelectedId(null); setLeaveOpen(false); setDetailsOpen(false); await refreshConversations(); }
    catch (e) { setError(e.message); }
    finally { setLeaveBusy(false); }
  }
  return <main className="flex h-[100dvh] min-h-[480px] overflow-hidden bg-white font-body text-slate-800">
    <Sidebar user={user} conversations={conversations} selectedId={selectedId} onSelect={setSelectedId} onNewChat={() => setCreateOpen(true)} onProfile={() => setProfileOpen(true)} onLogout={signOut} mobileHidden={!!selectedId}/>
    <section className={`relative min-w-0 flex-1 ${selectedId ? 'flex' : 'hidden lg:flex'}`}>
      {selected ? <>
        <div className="flex h-full min-w-0 flex-1 flex-col bg-[#f9faff]">
          <ChatHeader conversation={selected} userId={user.id} onBack={() => { activeRef.current = null; setSelectedId(null); }} onToggleInfo={() => setDetailsOpen(v => !v)} showInfo={detailsOpen} onSearch={() => setSearchOpen(v => !v)} showSearch={searchOpen}/>
          {searchOpen && <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 bg-white px-5 py-3"><Search size={18} className="text-slate-400"/><input autoFocus className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" placeholder="Search loaded messages..." value={messageSearch} onChange={e => setMessageSearch(e.target.value)}/><button className="text-slate-400" onClick={() => { setSearchOpen(false); setMessageSearch(''); }} aria-label="Close search"><X size={17}/></button></div>}
          <ChatTimeline key={selectedId} messages={messages} loading={loadingMessages} hasMore={hasMore} loadMore={loadMore} userId={user.id} members={selected.members} onMessageUpdate={upsertMessage} onError={setError} typingNames={Object.entries(typing).filter(([,value]) => value).map(([id]) => selected.members.find(m => m.id === id)?.name || 'Someone')} searchTerm={messageSearch}/>
          <Composer conversationId={selectedId} onSend={send} onError={setError} onTyping={value => socketRef.current?.emit('typing:set', { conversationId:selectedId, typing:value })}/>
        </div>
        {detailsOpen && <ConversationInfo conversation={selected} userId={user.id} onClose={() => setDetailsOpen(false)} onLeave={() => setLeaveOpen(true)}/>}
      </> : <EmptyWorkspace name={user.name} onNewChat={() => setCreateOpen(true)}/>}
      {connection === 'offline' && <div className="absolute bottom-24 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-lg"><WifiOff size={15}/> Live connection lost. Reconnecting…</div>}
    </section>
    {createOpen && <NewChatDialog onClose={() => setCreateOpen(false)} onCreated={createConversation}/>}
    {profileOpen && <ProfileDialog user={user} onClose={() => setProfileOpen(false)} onSaved={updated => setUser(updated)}/>}
    {leaveOpen && selected && <ConfirmLeaveDialog name={chatName(selected,user.id)} onClose={() => setLeaveOpen(false)} onConfirm={leaveGroup} busy={leaveBusy}/>}
    {error && <div role="alert" className="fixed bottom-5 left-1/2 z-[80] flex w-[min(94vw,440px)] -translate-x-1/2 items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-2xl"><span className="flex-1">{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={17}/></button></div>}
  </main>;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => { let alive = true; api('/auth/me').then(r => { if (alive) setUser(r.user); }).catch(() => {}).finally(() => { if (alive) setChecking(false); }); return () => { alive = false; }; }, []);
  if (checking) return <Loading full/>;
  if (!user) return <AuthScreen onAuthenticated={setUser}/>;
  return <ChatWorkspace user={user} setUser={setUser}/>;
}
