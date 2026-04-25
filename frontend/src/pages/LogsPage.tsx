import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { timeAgo } from '../utils/format';
import {
  getBackendLogs, clearBackendLogs,
  getNetworkLogs, clearNetworkLogs,
  type BackendLogEntry, type NetEntry, type LogLevel, type NetSource,
} from '../api/logs';
import { useFrontendLogStore, type FrontendLogLevel } from '../store/frontendLogStore';

type Tab = 'backend' | 'frontend' | 'network';

const LEVEL_COLOR: Record<LogLevel | FrontendLogLevel, string> = {
  debug: 'text-text-dim',
  log:   'text-text-dim',
  info:  'text-blue',
  warn:  'text-orange',
  error: 'text-red',
};

const SOURCE_COLOR: Record<NetSource, string> = {
  jupiter: 'text-green',
  openai: 'text-blue',
  solana: 'text-purple-400',
  telegram: 'text-cyan-400',
  other: 'text-text-dim',
};

function statusColor(status?: number, ok?: boolean): string {
  if (status == null) return 'text-red';
  if (ok) return 'text-green';
  if (status >= 400 && status < 500) return 'text-orange';
  return 'text-red';
}

function useBackendLogs() {
  return useQuery({
    queryKey: ['logs-backend'],
    queryFn: getBackendLogs,
    refetchInterval: 3_000,
    staleTime: 0,
    retry: false,
  });
}

function useNetworkLogs() {
  return useQuery({
    queryKey: ['logs-network'],
    queryFn: getNetworkLogs,
    refetchInterval: 3_000,
    staleTime: 0,
    retry: false,
  });
}

function Toolbar({
  search, setSearch,
  levelFilter, setLevelFilter,
  levels,
  rightSlot,
}: {
  search: string;
  setSearch: (v: string) => void;
  levelFilter: string;
  setLevelFilter: (v: string) => void;
  levels: { label: string; value: string }[];
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
      <div className="flex flex-col gap-1 min-w-[200px] flex-1">
        <label className="text-[10px] text-text-dim uppercase tracking-wide font-semibold">Search</label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="filter text…"
          className="bg-surface-2 border border-border rounded-md px-3 py-1.5 text-xs text-text placeholder:text-text-dim focus:outline-none focus:border-green/60"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-text-dim uppercase tracking-wide font-semibold">Filter</label>
        <div className="flex flex-wrap gap-1 bg-surface-2 rounded-lg p-1 border border-border">
          {levels.map(({ label, value }) => (
            <button key={value} onClick={() => setLevelFilter(value)}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${levelFilter === value ? 'bg-green text-bg' : 'text-text-dim hover:text-text'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {rightSlot}
    </div>
  );
}

function BackendTab() {
  const { data } = useBackendLogs();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<'all' | LogLevel>('all');
  const entries = data?.entries ?? [];

  const filtered = useMemo(() => entries.filter((e) => {
    if (level !== 'all' && e.level !== level) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.msg.toLowerCase().includes(q) && !e.scope.toLowerCase().includes(q) && !(e.meta ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  }), [entries, search, level]);

  async function handleClear() {
    if (!confirm('Clear backend log buffer?')) return;
    await clearBackendLogs().catch(() => {});
    qc.invalidateQueries({ queryKey: ['logs-backend'] });
  }

  return (
    <Card>
      <CardHeader
        title="Backend"
        subtitle={`${filtered.length} of ${entries.length} shown · ring buffer (last 2000)`}
        action={entries.length > 0 ? <Button variant="secondary" size="sm" onClick={handleClear}>Clear</Button> : undefined}
      />
      <CardBody className="flex flex-col gap-3">
        <Toolbar
          search={search} setSearch={setSearch}
          levelFilter={level} setLevelFilter={(v) => setLevel(v as 'all' | LogLevel)}
          levels={[
            { label: 'All', value: 'all' },
            { label: 'Debug', value: 'debug' },
            { label: 'Info', value: 'info' },
            { label: 'Warn', value: 'warn' },
            { label: 'Error', value: 'error' },
          ]}
        />
        <LogList rows={filtered} render={(e) => <BackendRow key={e.id} e={e} />} empty="No backend logs match filter" />
      </CardBody>
    </Card>
  );
}

function BackendRow({ e }: { e: BackendLogEntry }) {
  const color = LEVEL_COLOR[e.level] ?? 'text-text';
  return (
    <div className="grid grid-cols-[70px_56px_120px_1fr] gap-x-2 px-3 py-2 items-start text-xs border-b border-border/40">
      <span className="text-[10px] text-text-dim tabular-nums">{timeAgo(e.ts)}</span>
      <span className={`text-[10px] font-semibold uppercase ${color}`}>{e.level}</span>
      <span className="text-text-dim truncate" title={e.scope}>{e.scope}</span>
      <div className="min-w-0">
        <p className="text-text break-words whitespace-pre-wrap">{e.msg}</p>
        {e.meta && <pre className="mt-1 text-[10px] text-text-dim whitespace-pre-wrap break-all">{e.meta}</pre>}
      </div>
    </div>
  );
}

function FrontendTab() {
  const entries = useFrontendLogStore((s) => s.entries);
  const clear = useFrontendLogStore((s) => s.clear);
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<'all' | FrontendLogLevel>('all');

  const filtered = useMemo(() => entries.filter((e) => {
    if (level !== 'all' && e.level !== level) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.msg.toLowerCase().includes(q) && !(e.source ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  }), [entries, search, level]);

  return (
    <Card>
      <CardHeader
        title="Frontend"
        subtitle={`${filtered.length} of ${entries.length} shown · in-memory (last 1000)`}
        action={entries.length > 0 ? <Button variant="secondary" size="sm" onClick={() => { if (confirm('Clear frontend log buffer?')) clear(); }}>Clear</Button> : undefined}
      />
      <CardBody className="flex flex-col gap-3">
        <Toolbar
          search={search} setSearch={setSearch}
          levelFilter={level} setLevelFilter={(v) => setLevel(v as 'all' | FrontendLogLevel)}
          levels={[
            { label: 'All', value: 'all' },
            { label: 'Log', value: 'log' },
            { label: 'Info', value: 'info' },
            { label: 'Warn', value: 'warn' },
            { label: 'Error', value: 'error' },
          ]}
        />
        <LogList rows={filtered} render={(e) => (
          <div key={e.id} className="grid grid-cols-[70px_56px_1fr] gap-x-2 px-3 py-2 items-start text-xs border-b border-border/40">
            <span className="text-[10px] text-text-dim tabular-nums">{timeAgo(e.ts)}</span>
            <span className={`text-[10px] font-semibold uppercase ${LEVEL_COLOR[e.level]}`}>{e.level}</span>
            <div className="min-w-0">
              <p className="text-text break-words whitespace-pre-wrap">{e.msg}</p>
              {e.source && <p className="text-[10px] text-text-dim mt-0.5">{e.source}</p>}
            </div>
          </div>
        )} empty="No frontend logs yet" />
      </CardBody>
    </Card>
  );
}

function NetworkTab() {
  const { data } = useNetworkLogs();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<'all' | NetSource>('all');
  const entries = data?.entries ?? [];

  const filtered = useMemo(() => entries.filter((e) => {
    if (source !== 'all' && e.source !== source) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.url.toLowerCase().includes(q) && !e.method.toLowerCase().includes(q) && !(e.error ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  }), [entries, search, source]);

  async function handleClear() {
    if (!confirm('Clear network log buffer?')) return;
    await clearNetworkLogs().catch(() => {});
    qc.invalidateQueries({ queryKey: ['logs-network'] });
  }

  return (
    <Card>
      <CardHeader
        title="Network / RPC"
        subtitle={`${filtered.length} of ${entries.length} shown · ring buffer (last 1000)`}
        action={entries.length > 0 ? <Button variant="secondary" size="sm" onClick={handleClear}>Clear</Button> : undefined}
      />
      <CardBody className="flex flex-col gap-3">
        <Toolbar
          search={search} setSearch={setSearch}
          levelFilter={source} setLevelFilter={(v) => setSource(v as 'all' | NetSource)}
          levels={[
            { label: 'All', value: 'all' },
            { label: 'Jupiter', value: 'jupiter' },
            { label: 'OpenAI', value: 'openai' },
            { label: 'Solana', value: 'solana' },
            { label: 'Telegram', value: 'telegram' },
            { label: 'Other', value: 'other' },
          ]}
        />
        <LogList rows={filtered} render={(e) => <NetRow key={e.id} e={e} />} empty="No network calls yet" />
      </CardBody>
    </Card>
  );
}

function NetRow({ e }: { e: NetEntry }) {
  return (
    <div className="grid grid-cols-[70px_72px_56px_56px_64px_1fr] gap-x-2 px-3 py-2 items-start text-xs border-b border-border/40">
      <span className="text-[10px] text-text-dim tabular-nums">{timeAgo(e.ts)}</span>
      <span className={`text-[10px] font-semibold uppercase ${SOURCE_COLOR[e.source]}`}>{e.source}</span>
      <span className="text-[10px] font-mono text-text-dim">{e.method}</span>
      <span className={`text-[10px] font-mono tabular-nums text-right ${statusColor(e.status, e.ok)}`}>{e.status ?? 'ERR'}</span>
      <span className="text-[10px] font-mono text-text-dim text-right tabular-nums">{e.durationMs}ms</span>
      <div className="min-w-0">
        <p className="text-text break-all font-mono text-[11px]">{e.url}</p>
        {e.error && <p className="text-red text-[10px] break-words mt-0.5">{e.error}</p>}
      </div>
    </div>
  );
}

function LogList<T>({ rows, render, empty }: { rows: T[]; render: (e: T) => React.ReactNode; empty: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-text-dim text-center py-6">{empty}</p>;
  }
  return (
    <div className="overflow-y-auto border border-border rounded-lg" style={{ maxHeight: '70vh' }}>
      {rows.map(render)}
    </div>
  );
}

export function LogsPage() {
  const [tab, setTab] = useState<Tab>('backend');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'backend',  label: 'Backend' },
    { key: 'frontend', label: 'Frontend' },
    { key: 'network',  label: 'Network / RPC' },
  ];

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-4">
      <div className="flex gap-1 bg-surface-2 rounded-lg p-1 border border-border w-fit">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${tab === t.key ? 'bg-green text-bg' : 'text-text-dim hover:text-text'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'backend' && <BackendTab />}
      {tab === 'frontend' && <FrontendTab />}
      {tab === 'network' && <NetworkTab />}
    </div>
  );
}
