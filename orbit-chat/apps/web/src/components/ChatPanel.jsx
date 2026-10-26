import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, CheckCheck, ChevronDown, Ellipsis, Info, MessageCircle, Search, SendHorizontal, Smile, Users, X } from 'lucide-react';
import { api } from '../lib/api';
import { chatColor, chatName, dayLabel, lastActive, messageTime, partner } from '../lib/format';
import { Avatar } from './Shared';

const EMOJI = ['❤️', '👍', '😂', '😮', '🎉', '🔥'];

function MessageBubble({ message, mine, showAvatar, currentUserId, onUpdate, onError, seen }) {
  const [menu, setMenu] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.body);
  const [busy, setBusy] = useState(false);
  const edited = !!message.editedAt && !message.deletedAt;
  async function doEdit() {
    if (!editValue.trim() || editValue.trim() === message.body) { setEditing(false); return; }
    setBusy(true);
    try { const { message: updated } = await api(`/messages/${message.id}`, { method:'PATCH', body:{ body:editValue } }); onUpdate(updated); setEditing(false); }
    catch (err) { onError(err.message); } finally { setBusy(false); }
  }
  async function doDelete() {
    setMenu(false);
    if (!window.confirm('Delete this message for everyone?')) return;
    try { const { message: updated } = await api(`/messages/${message.id}`, { method:'DELETE' }); onUpdate(updated); }
    catch (err) { onError(err.message); }
  }
  async function react(emoji) {
    setReactionsOpen(false);
    try { const { message: updated } = await api(`/messages/${message.id}/reactions`, { method:'POST', body:{ emoji } }); onUpdate(updated); }
    catch (err) { onError(err.message); }
  }
  const groups = EMOJI.map(emoji => ({ emoji, count:message.reactions.filter(r => r.emoji === emoji).length, mine:message.reactions.some(r => r.emoji === emoji && r.userId === currentUserId) })).filter(r => r.count);
  return <div className={`group flex w-full items-end gap-2.5 ${mine ? 'justify-end' : 'justify-start'}`}>
    {!mine && <div className="mb-1 w-8 flex-none">{showAvatar && <Avatar name={message.senderName} color={message.senderAvatarColor} size="xs"/>}</div>}
    <div className={`relative flex max-w-[min(82%,540px)] flex-col ${mine ? 'items-end' : 'items-start'}`}>
      {!mine && showAvatar && <p className="mb-1 ml-1 text-[11px] font-extrabold text-slate-500">{message.senderName}</p>}
      <div className={`relative flex items-center gap-1.5 ${mine ? 'flex-row-reverse' : ''}`}>
        <div className={`bubble relative break-words ${mine ? 'bubble-mine' : 'bubble-theirs'} ${message.deletedAt ? 'italic opacity-75' : ''}`}>
          {editing ? <div className="min-w-[210px] sm:min-w-[280px]"><textarea autoFocus rows={3} maxLength={4000} value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setEditing(false); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doEdit(); } }} className="w-full resize-none rounded-xl border border-white/30 bg-white p-3 text-sm text-slate-900 outline-none"/>
            <div className="mt-2 flex justify-end gap-2"><button onClick={() => setEditing(false)} className="text-xs font-bold">Cancel</button><button onClick={doEdit} disabled={busy} className="rounded-lg bg-white/90 px-3 py-1.5 text-xs font-extrabold text-violet-700 disabled:opacity-50">Save</button></div></div>
            : <p className="whitespace-pre-wrap text-[13.5px] leading-[1.7] sm:text-[14px]">{message.deletedAt ? 'This message was deleted' : message.body}</p>}
          {!editing && <div className={`mt-1 flex items-center justify-end gap-1.5 text-[10px] font-semibold ${mine ? 'text-white/65' : 'text-slate-400'}`}>
            {edited && <span>edited · </span>}<time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time>{mine && <CheckCheck size={13} strokeWidth={2.5} className={seen ? 'text-white' : 'text-white/55'}/>}</div>}
        </div>
        {!message.deletedAt && !editing && <div className="relative flex flex-col gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          <button type="button" onClick={() => { setReactionsOpen(v => !v); setMenu(false); }} className="message-action" title="React" aria-label="React to message"><Smile size={15}/></button>
          {mine && <button type="button" onClick={() => { setMenu(v => !v); setReactionsOpen(false); }} className="message-action" title="Message options" aria-label="Message options"><Ellipsis size={16}/></button>}
          {menu && <div className={`absolute ${mine ? 'right-7' : 'left-7'} top-1 z-30 w-32 rounded-xl border border-slate-100 bg-white p-1.5 shadow-xl`}><button className="menu-option" onClick={() => { setEditing(true); setEditValue(message.body); setMenu(false); }}>Edit</button><button className="menu-option text-rose-600" onClick={doDelete}>Delete</button></div>}
          {reactionsOpen && <div className={`absolute ${mine ? 'right-7' : 'left-7'} top-0 z-30 flex gap-1 rounded-xl border border-slate-100 bg-white p-2 shadow-xl`}>{EMOJI.map(e => <button key={e} type="button" onClick={() => react(e)} className="rounded-lg p-1 text-lg hover:bg-violet-50" aria-label={`React ${e}`}>{e}</button>)}</div>}
        </div>}
      </div>
      {!!groups.length && <div className="mt-1 flex flex-wrap gap-1">{groups.map(r => <button type="button" key={r.emoji} onClick={() => react(r.emoji)} className={`rounded-full border px-2 py-0.5 text-[12px] shadow-sm ${r.mine ? 'border-violet-300 bg-violet-100' : 'border-slate-200 bg-white'}`} title="Toggle reaction">{r.emoji} <span className="text-[10px] font-bold text-slate-600">{r.count}</span></button>)}</div>}
    </div>
  </div>;
}

export function ChatTimeline({ messages, loading, hasMore, loadMore, userId, members, onMessageUpdate, onError, typingNames, searchTerm }) {
  const scrollRef = useRef(null);
  const prevHeight = useRef(null);
  const prevConversation = useRef(null);
  const lastMessageId = messages.at(-1)?.id;
  const filtered = searchTerm.trim() ? messages.filter(m => m.body.toLowerCase().includes(searchTerm.trim().toLowerCase())) : messages;
  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    if (prevHeight.current !== null) { box.scrollTop = box.scrollHeight - prevHeight.current; prevHeight.current = null; }
    else if (box.scrollHeight - box.scrollTop - box.clientHeight < 400 || !prevConversation.current) { box.scrollTop = box.scrollHeight; }
    prevConversation.current = lastMessageId || 'empty';
  }, [messages, lastMessageId]);
  async function older() {
    if (!scrollRef.current || loading) return;
    prevHeight.current = scrollRef.current.scrollHeight;
    try { const count = await loadMore(); if (!count) prevHeight.current = null; } catch { prevHeight.current = null; }
  }
  return <div ref={scrollRef} className="chat-scroll flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-7" aria-label="Messages">
    {hasMore && <div className="mb-5 flex justify-center"><button type="button" onClick={older} disabled={loading} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-extrabold text-slate-500 shadow-sm hover:text-violet-600">{loading ? 'Loading…' : 'Load earlier messages'}</button></div>}
    {loading && !messages.length && <p className="pt-20 text-center text-sm text-slate-400">Loading messages…</p>}
    {!loading && !messages.length && <div className="mx-auto flex max-w-xs flex-col items-center pt-[11vh] text-center"><div className="mb-5 grid h-20 w-20 place-items-center rounded-[26px] bg-violet-100 text-violet-600"><MessageCircle size={33}/></div><h3 className="font-display text-lg font-extrabold tracking-tight text-slate-800">A fresh conversation</h3><p className="mt-2 text-sm leading-6 text-slate-400">Break the ice — say hello and make someone's day.</p></div>}
    {searchTerm && !filtered.length && messages.length > 0 && <p className="py-12 text-center text-sm text-slate-400">No matching messages in loaded history.</p>}
    <div className="space-y-3">
      {filtered.map((message, index) => {
        const previous = filtered[index - 1];
        const startDay = !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt);
        const showAvatar = !previous || previous.senderId !== message.senderId || startDay;
        const mine = message.senderId === userId;
        const seen = mine && members.some(m => m.id !== userId && m.lastReadAt && new Date(m.lastReadAt) >= new Date(message.createdAt));
        return <div key={message.id}>
          {startDay && <div className="my-6 flex items-center justify-center gap-4"><span className="h-px max-w-20 flex-1 bg-slate-200/70"/><span className="rounded-full bg-white px-4 py-1.5 text-[11px] font-extrabold text-slate-400 shadow-sm ring-1 ring-slate-100">{dayLabel(message.createdAt)}</span><span className="h-px max-w-20 flex-1 bg-slate-200/70"/></div>}
          <MessageBubble message={message} mine={mine} showAvatar={showAvatar} currentUserId={userId} onUpdate={onMessageUpdate} onError={onError} seen={seen}/>
        </div>;
      })}
    </div>
    {!!typingNames.length && <div className="mt-5 flex items-center gap-2.5"><span className="typing-indicator"><i/><i/><i/></span><span className="text-xs text-slate-400">{typingNames.slice(0, 2).join(', ')} {typingNames.length > 1 ? 'are' : 'is'} typing…</span></div>}
    <div className="h-3"/>
  </div>;
}

export function ChatHeader({ conversation, userId, onBack, onToggleInfo, showInfo, onSearch, showSearch }) {
  const name = chatName(conversation, userId);
  const other = partner(conversation, userId);
  const group = conversation.kind === 'group';
  const online = group ? conversation.members.filter(m => m.online).length : other?.online;
  return <div className="chat-header flex h-[84px] shrink-0 items-center gap-3 border-b border-slate-100 bg-white/95 px-4 backdrop-blur sm:px-7">
    <button className="icon-button lg:hidden" onClick={onBack} aria-label="Back to conversations"><ArrowLeft size={21}/></button>
    {group ? <Avatar name={name} color={chatColor(conversation,userId)} square size="md"/> : <Avatar name={name} color={chatColor(conversation,userId)} online={!!online} size="md"/>}
    <div className="min-w-0 flex-1"><h2 className="truncate font-display text-[16px] font-extrabold tracking-tight text-slate-900 sm:text-[17px]">{name}</h2>
      <p className={`mt-0.5 truncate text-xs font-semibold ${online ? 'text-emerald-600' : 'text-slate-400'}`}>{group ? `${conversation.members.length} members · ${online} online` : lastActive(other)}</p></div>
    <div className="flex items-center gap-1.5"><button className={`icon-button ${showSearch ? 'bg-violet-50 text-violet-600' : ''}`} onClick={onSearch} title="Search loaded messages" aria-label="Search messages"><Search size={20}/></button><button className={`icon-button ${showInfo ? 'bg-violet-50 text-violet-600' : ''}`} onClick={onToggleInfo} title="Conversation details" aria-label="Conversation details"><Info size={20}/></button></div>
  </div>;
}

export function Composer({ conversationId, onSend, onTyping, onError }) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const typingTimeout = useRef(null);
  useEffect(() => { setDraft(''); setEmojiOpen(false); return () => { clearTimeout(typingTimeout.current); }; }, [conversationId]);
  function setTyping(v) {
    setDraft(v);
    if (v.trim()) onTyping(true);
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => onTyping(false), 1800);
  }
  async function submit() {
    if (!draft.trim() || sending) return;
    setSending(true);
    const content = draft;
    try { await onSend(content); setDraft(''); onTyping(false); clearTimeout(typingTimeout.current); }
    catch (err) { onError(err.message); }
    finally { setSending(false); }
  }
  return <div className="relative z-10 shrink-0 border-t border-slate-100 bg-white p-3 sm:px-7 sm:pb-5 sm:pt-4">
    {emojiOpen && <div className="absolute bottom-full left-5 mb-2 flex gap-2 rounded-2xl border border-slate-100 bg-white p-3 shadow-2xl">{['😊','💜','🙌','👋','🎉','😂','🔥','❤️'].map(emoji => <button key={emoji} onClick={() => { setDraft(v => v + emoji); setEmojiOpen(false); }} className="text-xl hover:scale-125" aria-label={`Insert ${emoji}`}>{emoji}</button>)}</div>}
    <div className="composer-box flex items-end gap-2 rounded-[20px] border border-slate-200 bg-[#fafbfe] p-2 shadow-sm focus-within:border-violet-300 focus-within:ring-4 focus-within:ring-violet-100/60">
      <button type="button" aria-label="Choose emoji" title="Insert emoji" onClick={() => setEmojiOpen(v => !v)} className="mb-1 grid h-10 w-10 flex-none place-items-center rounded-xl text-slate-400 hover:bg-white hover:text-violet-600"><Smile size={21}/></button>
      <textarea aria-label="Type a message" value={draft} onChange={e => setTyping(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }} rows={1} maxLength={4000} placeholder="Write your message..." className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-1 py-[11px] text-[14px] leading-5 text-slate-800 outline-none placeholder:text-slate-400"/>
      <button type="button" onClick={submit} disabled={!draft.trim() || sending} className="grid h-10 w-10 flex-none place-items-center rounded-[13px] bg-violet-600 text-white shadow-md shadow-violet-200 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none" title="Send message" aria-label="Send message"><SendHorizontal size={19}/></button>
    </div>
    <div className="mt-2 hidden items-center justify-between text-[11px] text-slate-400 sm:flex"><span>Press <kbd>Enter</kbd> to send, <kbd>Shift + Enter</kbd> for a new line</span><span>{draft.length}/4000</span></div>
  </div>;
}

export function ConversationInfo({ conversation, userId, onClose, onLeave }) {
  const other = partner(conversation, userId);
  const name = chatName(conversation, userId);
  const group = conversation.kind === 'group';
  return <aside className="info-panel absolute inset-0 z-20 flex w-full flex-col border-l border-slate-100 bg-white xl:static xl:w-[270px] xl:flex-none 2xl:w-[300px]">
    <div className="flex h-[84px] items-center justify-between border-b border-slate-100 px-6"><h3 className="font-display text-base font-extrabold text-slate-800">Conversation info</h3><button onClick={onClose} className="icon-button" aria-label="Close conversation details"><X size={20}/></button></div>
    <div className="flex flex-col items-center border-b border-slate-100 p-7 text-center"><Avatar name={name} color={chatColor(conversation,userId)} size="xl" square={group} online={!group && other?.online}/><h4 className="mt-4 font-display text-lg font-extrabold tracking-tight text-slate-900">{name}</h4><p className="mt-1 text-xs font-semibold text-slate-400">{group ? `${conversation.members.length} members` : lastActive(other)}</p>{!group && other?.status && <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-500">{other.status}</p>}</div>
    <div className="flex-1 overflow-y-auto px-6 py-6">{group ? <><div className="mb-4 flex items-center justify-between"><h5 className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-400">Members</h5><span className="rounded-lg bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-600">{conversation.members.length}</span></div>
      <div className="space-y-4">{conversation.members.map(m => <div key={m.id} className="flex items-center gap-3"><Avatar name={m.name} color={m.avatarColor} online={m.online} size="sm"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-700">{m.name}{m.id === userId ? ' (You)' : ''}</p><p className="truncate text-xs text-slate-400">{m.role === 'owner' ? 'Group owner' : m.online ? 'Online' : 'Member'}</p></div></div>)}</div></>
      : <><h5 className="mb-3 text-xs font-extrabold uppercase tracking-[.12em] text-slate-400">About</h5><p className="text-sm leading-6 text-slate-500">{other?.bio || 'A little mystery makes every conversation interesting.'}</p></>}
    </div>
    {group && <div className="border-t border-slate-100 p-6"><button type="button" onClick={onLeave} className="w-full rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600 transition hover:bg-rose-100">Leave group</button></div>}
  </aside>;
}
