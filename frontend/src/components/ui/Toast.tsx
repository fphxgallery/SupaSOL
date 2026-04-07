import { useUiStore } from '../../store/uiStore';
import { EXPLORER_BASE } from '../../config/constants';
import { useClusterStore } from '../../store/clusterStore';

const icons = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
};

const colors = {
  success: 'border-green/30 bg-green/10',
  error: 'border-red/30 bg-red/10',
  info: 'border-blue/30 bg-blue/10',
  warning: 'border-orange/30 bg-orange/10',
};

const iconColors = {
  success: 'text-green',
  error: 'text-red',
  info: 'text-blue',
  warning: 'text-orange',
};

export function ToastContainer() {
  const toasts = useUiStore((s) => s.toasts);
  const removeToast = useUiStore((s) => s.removeToast);
  const cluster = useClusterStore((s) => s.cluster);

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 p-3 rounded-xl border backdrop-blur-sm shadow-lg ${colors[t.type]} animate-in slide-in-from-right-full duration-300`}
        >
          <span className={`text-sm font-bold mt-0.5 ${iconColors[t.type]}`}>{icons[t.type]}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-text">{t.message}</p>
            {t.txSig && (
              <a
                href={`${EXPLORER_BASE}/tx/${t.txSig}?cluster=${cluster}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue hover:underline mt-0.5 block truncate"
              >
                View on Solscan ↗
              </a>
            )}
          </div>
          <button
            onClick={() => removeToast(t.id)}
            className="text-text-dim hover:text-text text-xs shrink-0"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
