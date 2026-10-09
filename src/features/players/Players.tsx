import { useCallback, useEffect, useState } from 'react';
import { Ban, Check, Copy, Gavel, Loader2, Megaphone, MessageSquare, Plus, RefreshCw, ShieldCheck, ShieldOff, Trash2, UserX, Users, Zap } from 'lucide-react';
import { useApp, useStatus } from '@/store/app';
import { api, errMsg } from '@/lib/ipc';
import type { Player } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, Dialog, Empty, Segmented } from '@/components/ui/Surface';
import { Input, Label } from '@/components/ui/Field';
import { confirm } from '@/components/ui/Confirm';

interface Template {
  label: string;
  command: string;
}

const DEFAULT_TEMPLATES: Template[] = [
  { label: 'Whisper welcome', command: 'ServerChatToPlayer "{name}" Welcome to the server, {name}!' },
];

function loadTemplates(): Template[] {
  try {
    return JSON.parse(localStorage.getItem('player-templates') ?? '') as Template[];
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

export function Players({ id }: { id: string }) {
  const status = useStatus(id);
  const toast = useApp((s) => s.toast);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [msgTarget, setMsgTarget] = useState<Player | null>(null);
  const [msg, setMsg] = useState('');
  const [broadcast, setBroadcast] = useState('');
  const [bMode, setBMode] = useState<'ServerChat' | 'Broadcast'>('ServerChat');
  const [manualId, setManualId] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>(loadTemplates);
  const [tplLabel, setTplLabel] = useState('');
  const [tplCmd, setTplCmd] = useState('');
  const online = !!status?.rconOk;

  const refresh = useCallback(async () => {
    if (!online) return;
    setLoading(true);
    try {
      setPlayers(await api.listPlayers(id));
    } catch (e) {
      toast('error', 'Could not list players', errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [id, online, toast]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10000);
    return () => clearInterval(t);
  }, [refresh]);

  const exec = async (command: string, ok: string) => {
    try {
      const out = await api.rcon(id, command);
      toast('success', ok, out && !out.startsWith('Server received') ? out : undefined);
      refresh();
    } catch (e) {
      toast('error', 'Command failed', errMsg(e));
    }
  };

  const saveTemplates = (t: Template[]) => {
    setTemplates(t);
    try {
      localStorage.setItem('player-templates', JSON.stringify(t));
    } catch {
      /* ignore */
    }
  };

  const fill = (cmd: string, p: Player) => cmd.replaceAll('{eosid}', p.eosId).replaceAll('{name}', p.name).replaceAll('{index}', String(p.index));

  if (!online)
    return (
      <div className="mx-auto max-w-xl px-6 py-10">
        <Card>
          <Empty icon={<Users className="size-5" />} title="Server offline" body="Player management uses RCON and becomes available as soon as the server is online." />
        </Card>
      </div>
    );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-[1180px] grid-cols-[minmax(0,1fr)_340px] gap-4 px-6 py-5">
        <Card className="self-start">
          <CardHeader
            title={`Online players (${players.length})`}
            subtitle="Refreshes every 10 seconds"
            actions={
              <Button size="sm" variant="ghost" icon={loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} onClick={refresh}>
                Refresh
              </Button>
            }
          />
          {players.length === 0 ? (
            <Empty icon={<Users className="size-5" />} title="Nobody online" body="Players appear here as soon as they join." />
          ) : (
            <div className="p-1.5">
              {players.map((p) => (
                <div key={p.eosId} className="group flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/[0.025]">
                  <div className="flex size-8 items-center justify-center rounded-full bg-accent/12 text-[12px] font-semibold text-accent">{p.name.slice(0, 1).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-fg">{p.name}</div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(p.eosId);
                        setCopied(p.eosId);
                        setTimeout(() => setCopied(null), 1200);
                      }}
                      className="flex items-center gap-1 font-mono text-[11px] text-fg-4 hover:text-fg-2"
                      title="Copy EOS ID"
                    >
                      {p.eosId}
                      {copied === p.eosId ? <Check className="size-3 text-ok" /> : <Copy className="size-3 opacity-0 group-hover:opacity-100" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {templates.map((t) => (
                      <button key={t.label} onClick={() => exec(fill(t.command, p), t.label)} className="rounded p-1.5 text-fg-3 hover:bg-hover hover:text-fg" title={t.label}>
                        <Zap className="size-3.5" />
                      </button>
                    ))}
                    <button onClick={() => setMsgTarget(p)} className="rounded p-1.5 text-fg-3 hover:bg-hover hover:text-fg" title="Message">
                      <MessageSquare className="size-3.5" />
                    </button>
                    <button onClick={() => exec(`AllowPlayerToJoinNoCheck ${p.eosId}`, `${p.name} whitelisted`)} className="rounded p-1.5 text-fg-3 hover:bg-hover hover:text-fg" title="Whitelist">
                      <ShieldCheck className="size-3.5" />
                    </button>
                    <button
                      onClick={async () => (await confirm({ title: `Kick ${p.name}?`, confirmLabel: 'Kick', danger: true })).ok && exec(`KickPlayer ${p.eosId}`, `${p.name} kicked`)}
                      className="rounded p-1.5 text-fg-3 hover:bg-hover hover:text-warn"
                      title="Kick"
                    >
                      <UserX className="size-3.5" />
                    </button>
                    <button
                      onClick={async () => (await confirm({ title: `Ban ${p.name}?`, body: 'They will be kicked and blocked from rejoining until unbanned.', confirmLabel: 'Ban player', danger: true })).ok && exec(`BanPlayer ${p.eosId}`, `${p.name} banned`)}
                      className="rounded p-1.5 text-fg-3 hover:bg-hover hover:text-err"
                      title="Ban"
                    >
                      <Ban className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Announce" icon={<Megaphone className="size-4" />} actions={<Segmented size="sm" value={bMode} onChange={setBMode} options={[{ value: 'ServerChat', label: 'Chat' }, { value: 'Broadcast', label: 'Center screen' }]} />} />
            <div className="flex gap-2 p-3">
              <Input value={broadcast} onChange={(e) => setBroadcast(e.target.value)} placeholder="Message to everyone" onKeyDown={(e) => e.key === 'Enter' && broadcast && exec(`${bMode} ${broadcast}`, 'Sent').then(() => setBroadcast(''))} />
              <Button disabled={!broadcast} onClick={() => exec(`${bMode} ${broadcast}`, 'Sent').then(() => setBroadcast(''))}>
                Send
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="By EOS ID" subtitle="Works for offline players too" icon={<Gavel className="size-4" />} />
            <div className="space-y-2 p-3">
              <Input value={manualId} onChange={(e) => setManualId(e.target.value.trim())} placeholder="0002abcdef…" mono />
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" icon={<ShieldCheck className="size-3.5" />} disabled={!manualId} onClick={() => exec(`AllowPlayerToJoinNoCheck ${manualId}`, 'Added to whitelist')}>
                  Whitelist
                </Button>
                <Button size="sm" variant="outline" icon={<ShieldOff className="size-3.5" />} disabled={!manualId} onClick={() => exec(`DisallowPlayerToJoinNoCheck ${manualId}`, 'Removed from whitelist')}>
                  Unwhitelist
                </Button>
                <Button size="sm" variant="danger" icon={<Ban className="size-3.5" />} disabled={!manualId} onClick={() => exec(`BanPlayer ${manualId}`, 'Player banned')}>
                  Ban
                </Button>
                <Button size="sm" variant="outline" disabled={!manualId} onClick={() => exec(`UnbanPlayer ${manualId}`, 'Player unbanned')}>
                  Unban
                </Button>
              </div>
              <p className="text-[11.5px] leading-relaxed text-fg-4">Turn on “Whitelist only” in Launch options to make the whitelist exclusive.</p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Quick actions" subtitle="Templates: {name}, {eosid}, {index}" icon={<Zap className="size-4" />} />
            <div className="space-y-1 p-2">
              {templates.map((t, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-white/[0.02]">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] text-fg">{t.label}</div>
                    <div className="truncate font-mono text-[10.5px] text-fg-4">{t.command}</div>
                  </div>
                  <button onClick={() => saveTemplates(templates.filter((_, j) => j !== i))} className="rounded p-1 text-fg-4 hover:text-err">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              <div className="space-y-2 border-t border-line p-2">
                <Input value={tplLabel} onChange={(e) => setTplLabel(e.target.value)} placeholder="Label" />
                <Input value={tplCmd} onChange={(e) => setTplCmd(e.target.value)} placeholder='e.g. ServerChatToPlayer "{name}" hi' mono />
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Plus className="size-3.5" />}
                  disabled={!tplLabel || !tplCmd}
                  onClick={() => {
                    saveTemplates([...templates, { label: tplLabel, command: tplCmd }]);
                    setTplLabel('');
                    setTplCmd('');
                  }}
                >
                  Add action
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Dialog
        open={!!msgTarget}
        onClose={() => setMsgTarget(null)}
        title={`Message ${msgTarget?.name}`}
        width={440}
        footer={
          <Button
            variant="primary"
            disabled={!msg}
            onClick={() => {
              exec(`ServerChatToPlayer "${msgTarget!.name}" ${msg}`, 'Message sent');
              setMsg('');
              setMsgTarget(null);
            }}
          >
            Send
          </Button>
        }
      >
        <Label>Private message</Label>
        <Input value={msg} onChange={(e) => setMsg(e.target.value)} autoFocus />
      </Dialog>
    </div>
  );
}
