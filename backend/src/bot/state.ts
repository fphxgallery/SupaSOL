import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { BotConfig, BotPosition, BotLogEntry, ClosedPosition } from './types';
import { DEFAULT_CONFIG } from './types';

const STATE_PATH = path.join(process.cwd(), 'bot-state.json');

interface BotStateData {
  config: BotConfig;
  positions: BotPosition[];
  closedPositions: ClosedPosition[];
  log: BotLogEntry[];
}

let state: BotStateData = {
  config: { ...DEFAULT_CONFIG },
  positions: [],
  closedPositions: [],
  log: [],
};

function persist() {
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify(state), 'utf8');
  } catch (e) {
    console.error('[bot-state] save failed:', e);
  }
}

try {
  if (fs.existsSync(STATE_PATH)) {
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) as Partial<BotStateData>;
    state = {
      config: { ...DEFAULT_CONFIG, ...raw.config, enabled: false },
      positions: raw.positions ?? [],
      closedPositions: raw.closedPositions ?? [],
      log: raw.log ?? [],
    };
  }
} catch {
  // ignore — use defaults
}

export function getState() { return state; }

export function setConfig(updates: Partial<BotConfig>) {
  state.config = { ...state.config, ...updates };
  persist();
}

export function getPositions() { return state.positions; }

export function addPosition(pos: BotPosition) {
  state.positions.push(pos);
  persist();
}

export function updatePosition(id: string, updates: Partial<BotPosition>) {
  const idx = state.positions.findIndex((p) => p.id === id);
  if (idx >= 0) {
    state.positions[idx] = { ...state.positions[idx], ...updates };
    persist();
  }
}

export function removePosition(id: string) {
  state.positions = state.positions.filter((p) => p.id !== id);
  persist();
}

export function addClosedPosition(pos: ClosedPosition) {
  state.closedPositions = [pos, ...state.closedPositions].slice(0, 500);
  persist();
}

export function clearClosedPositions() {
  state.closedPositions = [];
  persist();
}

export function addLog(entry: Omit<BotLogEntry, 'id' | 'time'>) {
  const log: BotLogEntry = { ...entry, id: randomUUID(), time: Date.now() };
  state.log = [log, ...state.log].slice(0, 500);
  persist();
  console.log(`[bot] [${entry.type}] ${entry.message}`);
}

export function clearLog() {
  state.log = [];
  persist();
}
