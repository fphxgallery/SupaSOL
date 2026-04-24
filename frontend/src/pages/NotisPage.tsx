import { useEffect, useState } from 'react';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import {
  getNotisConfig,
  updateNotisConfig,
  fetchTelegramChats,
  testTelegram,
  type NotisConfig,
  type NotisEvent,
  type TgChat,
} from '../api/notis';

const EVENT_LABELS: Record<NotisEvent, string> = {
  'bot.entry': 'Trade entry (buy)',
  'bot.exit':  'Trade exit (sell)',
  'bot.veto':  'AI veto',
  'bot.start': 'Bot start',
  'bot.stop':  'Bot stop',
  'bot.error': 'Errors',
};

const EVENT_ORDER: NotisEvent[] = ['bot.entry', 'bot.exit', 'bot.veto', 'bot.start', 'bot.stop', 'bot.error'];

export function NotisPage() {
  const [cfg, setCfg] = useState<NotisConfig | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [chatIdInput, setChatIdInput] = useState('');
  const [chats, setChats] = useState<TgChat[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [showGuide, setShowGuide] = useState(true);

  useEffect(() => {
    getNotisConfig().then((c) => {
      setCfg(c);
      setChatIdInput(c.telegram.chatId);
    }).catch(() => setMsg({ kind: 'err', text: 'Failed to load config' }));
  }, []);

  async function save(partial: Parameters<typeof updateNotisConfig>[0]) {
    setSaving(true);
    setMsg(null);
    try {
      const c = await updateNotisConfig(partial);
      setCfg(c);
      setMsg({ kind: 'ok', text: 'Saved' });
      setTokenInput('');
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message || 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  async function onFetchChats() {
    const token = tokenInput.trim() || (cfg?.telegram.hasToken ? 'SAVED' : '');
    if (!token) { setMsg({ kind: 'err', text: 'Enter a token first' }); return; }
    setLoadingChats(true);
    setMsg(null);
    try {
      // If user typed a new token, use it; else need them to type it again (we don't round-trip saved tokens)
      if (token === 'SAVED') {
        setMsg({ kind: 'err', text: 'Paste token again to list chats' });
        setLoadingChats(false);
        return;
      }
      const { chats } = await fetchTelegramChats(token);
      setChats(chats);
      if (chats.length === 0) {
        setMsg({ kind: 'err', text: 'No chats found. Message your bot first, then retry.' });
      }
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message || 'Failed' });
    } finally {
      setLoadingChats(false);
    }
  }

  async function onTest() {
    setTesting(true);
    setMsg(null);
    try {
      await testTelegram();
      setMsg({ kind: 'ok', text: 'Test sent' });
      const c = await getNotisConfig();
      setCfg(c);
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message || 'Test failed' });
    } finally {
      setTesting(false);
    }
  }

  const tg = cfg?.telegram;

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <h1 className="text-lg font-bold text-text">Notifications</h1>

      <Card>
        <CardHeader
          title="Telegram"
          subtitle={tg?.enabled ? 'Enabled' : 'Disabled'}
          action={tg && (
            <label className="flex items-center gap-2 text-xs text-text-dim cursor-pointer">
              <input
                type="checkbox"
                checked={tg.enabled}
                onChange={(e) => save({ telegram: { enabled: e.target.checked } })}
              />
              On
            </label>
          )}
        />
        <CardBody className="flex flex-col gap-4">
          <div>
            <button
              onClick={() => setShowGuide((s) => !s)}
              className="text-xs text-blue hover:underline"
            >
              {showGuide ? '▼' : '▶'} Setup via BotFather
            </button>
            {showGuide && (
              <ol className="mt-2 text-xs text-text-dim list-decimal list-inside space-y-1">
                <li>Open Telegram, message <code className="text-text">@BotFather</code>.</li>
                <li>Send <code className="text-text">/newbot</code>, pick a name + username.</li>
                <li>Copy the HTTP API token it returns.</li>
                <li>Open your new bot in Telegram and send it any message (e.g. <code className="text-text">hi</code>).</li>
                <li>Paste token below, click <b>Fetch chats</b>, pick your chat, save.</li>
                <li>Click <b>Send test</b> to verify.</li>
              </ol>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Input
              label="Bot token"
              type="password"
              placeholder={tg?.hasToken ? `Saved: ${tg.tokenMasked}` : '123456:AAxxx...'}
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => save({ telegram: { token: tokenInput } })}
                disabled={!tokenInput.trim() || saving}
              >
                Save token
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onFetchChats}
                loading={loadingChats}
                disabled={!tokenInput.trim()}
              >
                Fetch chats
              </Button>
            </div>
          </div>

          {chats.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-dim font-medium">Pick chat</label>
              <div className="flex flex-col gap-1">
                {chats.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setChatIdInput(c.id)}
                    className={`text-left text-xs px-3 py-2 rounded-md border ${
                      chatIdInput === c.id
                        ? 'border-green bg-green/10 text-text'
                        : 'border-border bg-surface-2 text-text-dim hover:text-text'
                    }`}
                  >
                    <span className="font-mono">{c.id}</span> — {c.label} <span className="text-muted">({c.type})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Input
              label="Chat ID"
              value={chatIdInput}
              onChange={(e) => setChatIdInput(e.target.value)}
              placeholder="123456789"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => save({ telegram: { chatId: chatIdInput } })}
              disabled={!chatIdInput.trim() || chatIdInput === tg?.chatId || saving}
            >
              Save chat ID
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs text-text-dim font-medium">Events</label>
            <div className="grid grid-cols-2 gap-2">
              {EVENT_ORDER.map((ev) => (
                <label key={ev} className="flex items-center gap-2 text-xs text-text cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tg?.events[ev] ?? false}
                    onChange={(e) => save({ telegram: { events: { [ev]: e.target.checked } } })}
                    disabled={saving}
                  />
                  {EVENT_LABELS[ev]}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-border">
            <Button
              variant="primary"
              size="sm"
              onClick={onTest}
              loading={testing}
              disabled={!tg?.hasToken || !tg?.chatId}
            >
              Send test
            </Button>
            {cfg?.lastSend && (
              <span className={`text-xs ${cfg.lastSend.ok ? 'text-green' : 'text-red'}`}>
                {cfg.lastSend.ok ? '✓' : '✗'} last {new Date(cfg.lastSend.ts).toLocaleTimeString()}
                {cfg.lastSend.error && ` — ${cfg.lastSend.error}`}
              </span>
            )}
          </div>

          {msg && (
            <div className={`text-xs ${msg.kind === 'ok' ? 'text-green' : 'text-red'}`}>
              {msg.text}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
