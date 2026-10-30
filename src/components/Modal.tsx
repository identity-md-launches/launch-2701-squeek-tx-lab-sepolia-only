import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

export function Modal({ title, open, onClose, children, wide = false }: { title: string; open: boolean; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) { dialog.showModal(); document.body.style.overflow = 'hidden'; }
    else { dialog.close(); document.body.style.overflow = ''; }
    return () => { document.body.style.overflow = ''; };
  }, [open]);
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} onCancel={() => close.current()} onClick={event => {
    if (event.target === ref.current) {
      const r = ref.current.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close.current();
    }
  }} aria-label={title}>
    <div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><Icon name="close"/></button></div>
    {children}
  </dialog>;
}
