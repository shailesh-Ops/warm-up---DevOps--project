import { useEffect } from 'react';
import { MessageCircleMore, X } from 'lucide-react';
import { initials } from '../lib/format';

export function Logo({ compact = false }) {
  return <div className="flex items-center gap-2.5 select-none">
    <span className="brand-symbol"><MessageCircleMore size={23} strokeWidth={2.6} /></span>
    {!compact && <span className="font-display text-[23px] font-extrabold tracking-[-0.075em] text-slate-900">orbit<span className="text-violet-500">.</span></span>}
  </div>;
}
export function Avatar({ name, color = '#8274e9', size = 'md', online = false, square = false, className = '' }) {
  const sizes = { xs: 'h-8 w-8 text-[11px]', sm: 'h-10 w-10 text-[12px]', md: 'h-12 w-12 text-[13px]', lg: 'h-14 w-14 text-[15px]', xl: 'h-20 w-20 text-[22px]' };
  return <span className={`relative inline-flex flex-none items-center justify-center font-display font-extrabold text-white ring-1 ring-black/5 ${square ? 'rounded-[17px]' : 'rounded-full'} ${sizes[size] || sizes.md} ${className}`}
    style={{ background: `linear-gradient(145deg, ${color}, ${color}D9)` }} aria-label={name}>
    {initials(name)}
    {online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-[2.5px] border-white bg-emerald-400" />}
  </span>;
}
export function Modal({ title, children, onClose, width = 'max-w-md' }) {
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label={title} className={`modal-card w-full ${width}`}>
      <div className="mb-6 flex items-center justify-between"><h2 className="font-display text-xl font-extrabold tracking-tight text-slate-900">{title}</h2>
        <button type="button" onClick={onClose} className="icon-button" aria-label="Close"><X size={19} /></button></div>
      {children}
    </section>
  </div>;
}
export function Loading({ full = false }) {
  return <div className={`flex items-center justify-center gap-3 ${full ? 'min-h-screen' : 'min-h-40'}`}>
    <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-violet-200 border-t-violet-600" />
    <span className="text-sm font-medium text-slate-500">Getting things ready…</span>
  </div>;
}
