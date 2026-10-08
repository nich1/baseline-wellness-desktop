"use client";

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { filterThemes, themeCatalog, themeCollections, themeFields, themePresets, type Theme, type ThemeCollection } from '@/lib/themes';
import { useTheme } from './ThemeProvider';
import { BrandMark } from './Brand';

export function SettingsButton() {
  const { preferences, preview, save } = useTheme();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Theme>(preferences.active);
  const [custom, setCustom] = useState<Theme[]>([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [collection, setCollection] = useState<ThemeCollection>('All themes');
  const close = () => { dialog.current?.close(); preview(null); setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; preview(null); };
  }, [open, preview]);
  function choose(theme: Theme) { setDraft(theme); preview(theme); setError(''); }
  function changeColor(key: string, value: string) {
    const isPreset = themePresets.some(theme => theme.id === draft.id);
    choose({...draft, id: isPreset ? `custom-${crypto.randomUUID()}` : draft.id,
      name: isPreset ? `${draft.name} custom` : draft.name, colors:{...draft.colors,[key]:value}});
  }
  function apply() {
    const name = draft.name.trim();
    if (!name) { setError('Give your theme a name.'); return; }
    const next = {...draft,name};
    const isPreset = themePresets.some(theme => theme.id===next.id);
    if (!isPreset && custom.length >= 50 && !custom.some(theme => theme.id===next.id)) { setError('You can save up to 50 custom themes. Delete one to make room.'); return; }
    const themes = isPreset ? custom : [...custom.filter(theme => theme.id!==next.id),next];
    try { save({active:next,custom:themes}); dialog.current?.close(); setOpen(false); trigger.current?.focus(); }
    catch { setError('Your browser could not save this theme. Allow site storage and try again.'); }
  }
  const isCustom = !themePresets.some(theme => theme.id===draft.id);
  const visibleThemes = filterThemes([...themePresets,...custom],search,collection);
  return <>
    <button ref={trigger} className="settings-button" type="button" aria-label="Settings" title="Settings" aria-haspopup="dialog" onClick={() => {
      setDraft(preferences.active); setCustom(preferences.custom); setError(''); setSearch(''); setCollection('All themes'); setOpen(true);
    }}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m9.5 3-.6 2.2-1.6.9-2.2-.6-2.5 4.3 1.6 1.6v1.8l-1.6 1.6 2.5 4.3 2.2-.6 1.6.9.6 2.2h5l.6-2.2 1.6-.9 2.2.6 2.5-4.3-1.6-1.6v-1.8l1.6-1.6-2.5-4.3-2.2.6-1.6-.9L14.5 3z"/><circle cx="12" cy="12.3" r="3.3"/></svg>
    </button>
    {open && createPortal(<dialog ref={dialog} className="theme-dialog" aria-labelledby={heading} onCancel={event => {event.preventDefault();close();}} onClick={event => {if(event.target===dialog.current){const rect=dialog.current.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();}}}>
      <header className="theme-header"><div><span>Settings</span><h2 id={heading}>Themes</h2></div><button className="theme-close" aria-label="Close settings" onClick={close}>×</button></header>
      <div className="theme-body">
        <p className="theme-intro">Make Baseline yours. Preview changes here, then apply. Saved in this browser.</p>
        <div className="theme-browse">
          <label>Find a theme<input type="search" aria-label="Search themes" placeholder="Tokyo, neon, purple…" value={search} onChange={event=>setSearch(event.target.value)}/></label>
          <label>Collection<select aria-label="Theme collection" value={collection} onChange={event=>setCollection(event.target.value as ThemeCollection)}>{themeCollections.map(name=><option key={name}>{name}</option>)}</select></label>
        </div>
        <div className="theme-gallery-summary"><span role="status">{visibleThemes.length} {visibleThemes.length===1 ? 'theme' : 'themes'}</span><span>Previewing <strong>{draft.name}</strong></span></div>
        <div className="theme-presets" aria-label="Color themes">
          {visibleThemes.map(theme => <button key={theme.id} className="theme-preset" aria-pressed={draft.id===theme.id} title={themeCatalog[theme.id]?.description} onClick={() => choose(theme)}>
            <span className="theme-swatches" aria-hidden="true">{['bg','surface','accent','chart','fg'].map(key=><i key={key} style={{background:theme.colors[key]}}/>)}</span><span>{theme.name}</span><small>{theme.id==='baseline' ? 'Default' : themeCatalog[theme.id]?.collection ?? 'Custom'}</small>
          </button>)}
        </div>
        {!visibleThemes.length && <div className="theme-empty"><p>No themes match your search.</p><button className="button" onClick={()=>{setSearch('');setCollection('All themes');}}>Clear filters</button></div>}
        <div className="theme-preview" aria-label="Theme preview"><BrandMark/><div><span>Accent & chart</span><svg viewBox="0 0 160 42" aria-hidden="true"><path d="M1 35 30 23 55 28 85 10 115 17 159 3" fill="none" stroke="var(--chart)" strokeWidth="3"/></svg></div><div className="theme-changes"><span style={{color:'var(--weight-up)'}}>↑ 0.8%</span><span style={{color:'var(--weight-down)'}}>↓ 0.8%</span></div></div>
        <div className="theme-custom-actions">
          <button className="button" onClick={() => choose({...draft,id:`custom-${crypto.randomUUID()}`,name:`${draft.name.slice(0,50)} copy`})}>Create custom theme</button>
          {isCustom && custom.some(theme=>theme.id===draft.id) && <button className="button theme-delete" onClick={() => {setCustom(custom.filter(theme=>theme.id!==draft.id));choose(themePresets[0]);}}>Delete theme</button>}
        </div>
        {isCustom && <label className="theme-name">Theme name<input maxLength={60} value={draft.name} onChange={event=>setDraft({...draft,name:event.target.value})}/></label>}
        {[...new Set(themeFields.map(([, , ,group])=>group))].map(group=><details key={group} className="theme-group"><summary>{group}</summary><div className="theme-color-grid">{themeFields.filter(([, , ,section])=>section===group).map(([key,label])=><label key={key} className="theme-color"><input type="color" aria-label={label} value={draft.colors[key]} onChange={event=>changeColor(key,event.target.value)}/><span>{label}<small>{draft.colors[key].toUpperCase()}</small></span></label>)}</div></details>)}
      </div>
      <footer className="theme-footer">{error && <p role="alert">{error}</p>}<button className="button" onClick={close}>Cancel</button><button className="button primary" onClick={apply}>Apply theme</button></footer>
    </dialog>, document.body)}
  </>;
}
