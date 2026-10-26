import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function Dialog({children,onClose,title,className=''}:{children:ReactNode;onClose:()=>void;title:string;className?:string}){
  const ref=useRef<HTMLDivElement>(null);
  const closeRef=useRef(onClose);closeRef.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const list=()=>Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')||[]);
    list()[0]?.focus();
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){e.preventDefault();closeRef.current();}
      if(e.key==='Tab'){const items=list();if(!items.length)return;const first=items[0],last=items.at(-1)!;
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
    };
    document.addEventListener('keydown',key);
    return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key);previous?.focus();};
  },[]);
  return <div className={`dialog-backdrop ${className}`} onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={ref} className="dialog" role="dialog" aria-modal="true" aria-label={title}><button className="dialog-close icon-button" onClick={onClose} aria-label={title}><X size={20}/></button>{children}</div></div>;
}
