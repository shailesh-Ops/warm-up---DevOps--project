import { format, isToday, isYesterday, isThisYear } from 'date-fns';
export const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('') || '?';
export const chatName = (conversation, selfId) => conversation?.kind === 'group'
  ? conversation.name : conversation?.members?.find(member => member.id !== selfId)?.name || 'Conversation';
export const partner = (conversation, selfId) => conversation?.members?.find(member => member.id !== selfId);
export const chatColor = (conversation, selfId) => conversation?.kind === 'group' ? '#8076E8' : partner(conversation, selfId)?.avatarColor || '#8076E8';
export function conversationTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '';
  return isToday(date) ? format(date, 'h:mm a') : isYesterday(date) ? 'Yesterday' : format(date, 'MMM d');
}
export function dayLabel(value) {
  const d = new Date(value);
  return isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : isThisYear(d) ? format(d, 'MMMM d') : format(d, 'MMMM d, yyyy');
}
export function messageTime(value) { return value ? format(new Date(value), 'h:mm a') : ''; }
export function lastActive(member) {
  if (!member) return 'Offline';
  if (member.online) return 'Online now';
  if (!member.lastSeenAt) return 'Not online recently';
  return `Last seen ${conversationTime(member.lastSeenAt)}`;
}
