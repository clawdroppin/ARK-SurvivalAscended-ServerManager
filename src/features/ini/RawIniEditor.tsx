import { useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror, { EditorView, type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { search } from '@codemirror/search';
import { tags as t } from '@lezer/highlight';
import { AlertCircle, AlertTriangle, Columns2, FileText, Info, ListTree, Loader2, RefreshCw, Search } from 'lucide-react';
import { api, GAME, GUS, type IniFileName } from '@/lib/ipc';
import { IniDoc } from '@/lib/ini';
import type { IniIssue } from '@/lib/types';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Surface';
import { useConfigDraft } from '@/features/settings/useConfigDraft';
import { SaveBar } from '@/features/settings/SettingsEditor';

const theme = EditorView.theme(
  {
    '&': { backgroundColor: 'transparent', color: '#d4d4d8' },
    '.cm-gutters': { backgroundColor: 'transparent', color: '#52525b', border: 'none' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#a1a1aa' },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.025)' },
    '.cm-cursor': { borderLeftColor: '#2dd4bf' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'rgba(45,212,191,0.22) !important' },
    '.cm-searchMatch': { backgroundColor: 'rgba(251,191,36,0.25)', outline: '1px solid rgba(251,191,36,0.4)' },
    '.cm-panels': { backgroundColor: '#131316', color: '#ededf0', borderColor: '#2e2e36' },
    '.cm-panels input, .cm-panels button': { fontFamily: 'inherit' },
    '.cm-textfield': { backgroundColor: '#0f0f12', border: '1px solid #2e2e36', borderRadius: '6px', color: '#ededf0' },
    '.cm-button': { backgroundImage: 'none', backgroundColor: '#1f1f24', border: '1px solid #2e2e36', borderRadius: '6px', color: '#ededf0' },
    '.cm-lint-marker': { width: '0.8em', height: '0.8em' },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  { tag: t.comment, color: '#52525b', fontStyle: 'italic' },
  { tag: [t.heading, t.className, t.typeName], color: '#5eead4', fontWeight: '600' },
  { tag: t.propertyName, color: '#c4b5fd' },
  { tag: t.variableName, color: '#93c5fd' },
  { tag: [t.string, t.special(t.string)], color: '#fde68a' },
  { tag: [t.number, t.bool, t.atom], color: '#f9a8d4' },
  { tag: t.operator, color: '#71717a' },
]);

/** ARK-flavoured INI tokenizer: sections, keys (with [index]), and struct-aware values. */
const iniLang = StreamLanguage.define<{ inValue: boolean }>({
  name: 'ark-ini',
  startState: () => ({ inValue: false }),
  token(stream, state) {
    if (stream.sol()) {
      state.inValue = false;
      stream.eatSpace();
      if (stream.peek() === ';' || stream.peek() === '#') {
        stream.skipToEnd();
        return 'comment';
      }
      if (stream.peek() === '[') {
        stream.skipToEnd();
        return 'heading';
      }
    }
    if (!state.inValue) {
      if (stream.eat('=')) {
        state.inValue = true;
        return 'operator';
      }
      if (stream.match(/^\[\d+\]/)) return 'number';
      stream.eatWhile(/[^=\[]/);
      return 'propertyName';
    }
    if (stream.match(/^"[^"]*"?/)) return 'string';
    if (stream.match(/^-?\d+(\.\d+)?(?![\w.])/)) return 'number';
    if (stream.match(/^(true|false)(?!\w)/i)) return 'bool';
    if (stream.match(/^[(),]/)) return 'operator';
    if (stream.match(/^[A-Za-z_][\w.]*(?==)/)) return 'variableName';
    if (stream.eat('=')) return 'operator';
    stream.next();
    return 'string';
  },
});

function makeLinter(onIssues: (i: IniIssue[]) => void) {
  return linter(
    async (view) => {
      const text = view.state.doc.toString();
      const issues = await api.validateIni(text).catch(() => [] as IniIssue[]);
      onIssues(issues);
      return issues.map<Diagnostic>((i) => {
        const line = view.state.doc.line(Math.min(Math.max(1, i.line), view.state.doc.lines));
        return { from: line.from, to: line.to, severity: i.severity === 'info' ? 'info' : i.severity, message: i.message, source: 'ARK INI' };
      });
    },
    { delay: 250 },
  );
}

export default function RawIniEditor({ id }: { id: string }) {
  const cfg = useConfigDraft(id);
  const [file, setFile] = useState<IniFileName>(GUS);
  const [split, setSplit] = useState(false);

  if (!cfg.loaded || !cfg.text)
    return (
      <div className="flex h-full items-center justify-center gap-2 text-[13px] text-fg-3">
        <Loader2 className="size-4 animate-spin" /> Reading configuration…
      </div>
    );

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2">
        {!split && (
          <Segmented
            value={file}
            onChange={setFile}
            size="sm"
            options={[
              { value: GUS, label: 'GameUserSettings.ini', icon: <FileText className="size-3" /> },
              { value: GAME, label: 'Game.ini', icon: <FileText className="size-3" /> },
            ]}
          />
        )}
        {split && <span className="text-[12px] text-fg-3">Both files side by side</span>}
        <div className="flex-1" />
        <span className="text-[11.5px] text-fg-4">
          Ctrl F search · Ctrl S save · edits are shared with the Settings tab
        </span>
        <Button size="sm" variant={split ? 'secondary' : 'ghost'} icon={<Columns2 className="size-3.5" />} onClick={() => setSplit((s) => !s)}>
          Split view
        </Button>
        <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} onClick={cfg.reload} disabled={cfg.dirtyFiles.length > 0} title="Reload from disk">
          Reload
        </Button>
      </div>
      <div className="flex min-h-0 flex-1">
        {split ? (
          <>
            <Pane file={GUS} text={cfg.text[GUS]} onChange={(v) => cfg.setText(GUS, v)} onSave={cfg.save} compact />
            <div className="w-px bg-line" />
            <Pane file={GAME} text={cfg.text[GAME]} onChange={(v) => cfg.setText(GAME, v)} onSave={cfg.save} compact />
          </>
        ) : (
          <Pane key={file} file={file} text={cfg.text[file]} onChange={(v) => cfg.setText(file, v)} onSave={cfg.save} />
        )}
      </div>
      <SaveBar dirty={cfg.dirtyFiles} saving={cfg.saving} onSave={cfg.save} onDiscard={cfg.discard} />
    </div>
  );
}

function Pane({ file, text, onChange, onSave, compact }: { file: IniFileName; text: string; onChange: (v: string) => void; onSave: () => void; compact?: boolean }) {
  const ref = useRef<ReactCodeMirrorRef>(null);
  const [issues, setIssues] = useState<IniIssue[]>([]);
  const [filter, setFilter] = useState('');
  const [side, setSide] = useState<'outline' | 'issues'>('outline');
  const extensions = useMemo(
    () => [
      iniLang,
      syntaxHighlighting(highlight),
      theme,
      search({ top: true }),
      lintGutter(),
      makeLinter(setIssues),
      EditorView.lineWrapping,
      EditorView.domEventHandlers({
        keydown: (e) => {
          if (e.ctrlKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            onSave();
            return true;
          }
          return false;
        },
      }),
    ],
    [onSave],
  );

  const outline = useMemo(() => IniDoc.parse(text).outline(), [text]);
  const f = filter.trim().toLowerCase();
  const filtered = f ? outline.filter((o) => o.key.toLowerCase().includes(f) || o.value.toLowerCase().includes(f) || o.section.toLowerCase().includes(f)) : outline;
  const grouped = useMemo(() => {
    const m = new Map<string, typeof filtered>();
    for (const o of filtered.slice(0, 1500)) m.set(o.section, [...(m.get(o.section) ?? []), o]);
    return [...m.entries()];
  }, [filtered]);

  const jump = (line: number) => {
    const view = ref.current?.view;
    if (!view) return;
    const l = view.state.doc.line(Math.min(line, view.state.doc.lines));
    view.dispatch({ selection: { anchor: l.from, head: l.to }, effects: EditorView.scrollIntoView(l.from, { y: 'center' }) });
    view.focus();
  };

  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;

  useEffect(() => {
    if (errors > 0) setSide('issues');
  }, [errors]);

  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        {compact && (
          <div className="flex h-8 items-center gap-2 border-b border-line px-3 text-[11.5px] text-fg-3">
            <FileText className="size-3" /> {file}
            <span className="flex-1" />
            {errors > 0 && <span className="text-err">{errors} errors</span>}
            {warnings > 0 && <span className="text-warn">{warnings} warnings</span>}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-hidden">
          <CodeMirror
            ref={ref}
            value={text}
            onChange={onChange}
            extensions={extensions}
            theme="none"
            height="100%"
            style={{ height: '100%' }}
            basicSetup={{ highlightActiveLine: true, foldGutter: false, autocompletion: false, searchKeymap: true }}
          />
        </div>
      </div>
      {!compact && (
        <aside className="flex w-[300px] shrink-0 flex-col border-l border-line">
          <div className="flex items-center gap-2 border-b border-line p-2">
            <Segmented
              value={side}
              onChange={setSide}
              size="sm"
              options={[
                { value: 'outline', label: 'Outline', icon: <ListTree className="size-3" /> },
                {
                  value: 'issues',
                  label: (
                    <span className="flex items-center gap-1">
                      Issues
                      {issues.length > 0 && <span className={cn('rounded px-1 text-[10px]', errors ? 'bg-err/20 text-err' : 'bg-warn/15 text-warn')}>{issues.length}</span>}
                    </span>
                  ),
                },
              ]}
            />
          </div>
          {side === 'outline' ? (
            <>
              <div className="relative p-2">
                <Search className="pointer-events-none absolute top-1/2 left-4.5 size-3.5 -translate-y-1/2 text-fg-4" />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter keys, values, sections"
                  className="h-7 w-full rounded-md border border-line-strong bg-bg-raised pr-2 pl-7 text-[12px] text-fg placeholder:text-fg-4 focus:border-accent/50 focus:outline-none"
                />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {grouped.map(([section, items]) => (
                  <div key={section} className="mb-2">
                    <div className="sticky top-0 bg-bg/95 px-1.5 py-1 font-mono text-[10.5px] text-accent/80 backdrop-blur">[{section || 'no section'}]</div>
                    {items.map((o) => (
                      <button key={o.line} onClick={() => jump(o.line)} className="flex w-full items-baseline gap-2 rounded px-1.5 py-0.5 text-left hover:bg-hover">
                        <span className="truncate font-mono text-[11px] text-fg-2">{o.key}</span>
                        <span className="ml-auto max-w-[45%] shrink-0 truncate font-mono text-[10.5px] text-fg-4">{o.value}</span>
                      </button>
                    ))}
                  </div>
                ))}
                {grouped.length === 0 && <div className="py-6 text-center text-[12px] text-fg-4">No matches</div>}
              </div>
            </>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {issues.length === 0 && <div className="py-8 text-center text-[12px] text-ok">No problems found</div>}
              {issues.map((i, n) => (
                <button key={n} onClick={() => jump(i.line)} className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-hover">
                  {i.severity === 'error' ? <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-err" /> : i.severity === 'warning' ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" /> : <Info className="mt-0.5 size-3.5 shrink-0 text-info" />}
                  <span className="text-[12px] text-fg-2">
                    <span className="font-mono text-fg-4">L{i.line}</span> {i.message}
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
