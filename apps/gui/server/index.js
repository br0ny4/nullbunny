import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '../..');
const dataDir = join(rootDir, '.data', 'gui');
const tasksFile = join(dataDir, 'tasks.json');
const settingsFile = join(dataDir, 'settings.json');
const reportsDir = join(rootDir, 'reports');
const cliPath = join(rootDir, 'packages/cli/dist/index.js');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend files in production
app.use(express.static(join(__dirname, '../dist')));

const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
const wsClients = new Set();

function wsSend(ws, payload) {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify(payload));
}

function wsBroadcast(taskId, payload) {
  for (const ws of wsClients) {
    if (ws.readyState !== 1) continue;
    const subs = ws.__subs;
    if (subs === '*' || (subs instanceof Set && subs.has(taskId))) {
      wsSend(ws, { taskId, ...payload });
    }
  }
}

function wsBroadcastAny(payload) {
  for (const ws of wsClients) {
    if (ws.readyState !== 1) continue;
    const subs = ws.__subs;
    if (subs === '*') {
      wsSend(ws, payload);
    }
  }
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function ensureWsSetup() {
  if (wss.__setup) return;
  wss.__setup = true;

  wss.on('connection', (ws) => {
    ws.__subs = new Set();
    wsClients.add(ws);

    ws.on('message', (data) => {
      const text = typeof data === 'string' ? data : data.toString('utf-8');
      const msg = parseJsonSafe(text);
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'subscribeAll') {
        ws.__subs = '*';
        wsSend(ws, { type: 'hello', mode: 'all' });
        return;
      }

      if (msg.type === 'subscribe' && typeof msg.taskId === 'string') {
        if (ws.__subs === '*') return;
        ws.__subs.add(msg.taskId);
        const task = findTask(msg.taskId);
        if (task) {
          wsSend(ws, { taskId: msg.taskId, type: 'task', task });
        }
        return;
      }

      if (msg.type === 'unsubscribe' && typeof msg.taskId === 'string') {
        if (ws.__subs === '*') return;
        ws.__subs.delete(msg.taskId);
        return;
      }
    });

    ws.on('close', () => {
      wsClients.delete(ws);
    });
  });
}

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function readJsonFile(path, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(path, value) {
  ensureDataDir();
  fs.writeFileSync(path, JSON.stringify(value, null, 2), 'utf-8');
}

const tasks = readJsonFile(tasksFile, []);
const running = new Map();
const subscribers = new Map();
let saveTimer = null;

function nowIso() {
  return new Date().toISOString();
}

function listTasks() {
  return [...tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function findTask(id) {
  return tasks.find((t) => t.id === id);
}

function updateTask(id, patch) {
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx === -1) return undefined;
  tasks[idx] = { ...tasks[idx], ...patch, updatedAt: nowIso() };
  scheduleSave();
  broadcast(id, { type: 'task', task: tasks[idx] });
  return tasks[idx];
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    writeJsonFile(tasksFile, tasks);
  }, 500);
}

function broadcast(taskId, payload) {
  const subs = subscribers.get(taskId);
  if (!subs) return;
  const text = `event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of subs) {
    res.write(text);
  }

  wsBroadcast(taskId, payload);
}

function addLog(taskId, line) {
  const task = findTask(taskId);
  if (!task) return;
  const logs = Array.isArray(task.logs) ? task.logs : [];
  logs.push({ ts: Date.now(), line });
  if (logs.length > 2000) logs.splice(0, logs.length - 2000);
  updateTask(taskId, { logs });
  broadcast(taskId, { type: 'log', line });
}

function computeCpuUsage() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      total += cpu.times[type];
    }
    idle += cpu.times.idle;
  }
  return 100 - ~~((100 * idle) / total);
}

// System stats
app.get('/api/sys/stats', (req, res) => {
  const cpuUsage = computeCpuUsage();
  res.json({
    cpuUsage,
    memoryUsage: process.memoryUsage(),
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    uptime: os.uptime(),
    activeTasks: running.size,
  });
});

app.get('/api/settings', (req, res) => {
  res.json(readJsonFile(settingsFile, {}));
});

app.put('/api/settings', (req, res) => {
  writeJsonFile(settingsFile, req.body ?? {});
  res.json({ ok: true });
});

function readSettings() {
  return readJsonFile(settingsFile, {});
}

function writeSettings(next) {
  writeJsonFile(settingsFile, next ?? {});
}

function listPluginSources() {
  const base = readSettings();
  const configured = Array.isArray(base.pluginDirs) ? base.pluginDirs.filter((p) => typeof p === 'string') : [];
  const defaults = [join(rootDir, 'examples', 'extensions')];
  return Array.from(new Set([...defaults, ...configured]));
}

function listAvailableManifests() {
  const dirs = listPluginSources();
  const all = [];
  for (const dir of dirs) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isFile() || !e.name.endsWith('.json')) continue;
        const path = join(dir, e.name);
        const raw = readJsonFile(path, null);
        if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') continue;
        all.push({
          path,
          id: raw.id,
          label: typeof raw.label === 'string' ? raw.label : raw.id,
          attacks: Array.isArray(raw.attacks) ? raw.attacks.length : 0,
          judges: Array.isArray(raw.judges) ? raw.judges.length : 0,
        });
      }
    } catch {}
  }
  return all.sort((a, b) => a.label.localeCompare(b.label));
}

app.get('/api/plugins', (req, res) => {
  const settings = readSettings();
  const enabledPaths = Array.isArray(settings.enabledManifests) ? settings.enabledManifests : [];
  res.json({
    enabledPaths,
    available: listAvailableManifests(),
    sources: listPluginSources(),
  });
});

app.post('/api/plugins/enable', (req, res) => {
  const path = req.body?.path;
  if (typeof path !== 'string' || !path.trim()) {
    res.status(400).json({ error: 'path is required' });
    return;
  }
  const settings = readSettings();
  const enabled = new Set(Array.isArray(settings.enabledManifests) ? settings.enabledManifests : []);
  enabled.add(path);
  writeSettings({ ...settings, enabledManifests: Array.from(enabled) });
  res.json({ ok: true });
});

app.post('/api/plugins/disable', (req, res) => {
  const path = req.body?.path;
  if (typeof path !== 'string' || !path.trim()) {
    res.status(400).json({ error: 'path is required' });
    return;
  }
  const settings = readSettings();
  const enabled = new Set(Array.isArray(settings.enabledManifests) ? settings.enabledManifests : []);
  enabled.delete(path);
  writeSettings({ ...settings, enabledManifests: Array.from(enabled) });
  res.json({ ok: true });
});

app.get('/api/tasks', (req, res) => {
  res.json(listTasks());
});

app.get('/api/tasks/:id', (req, res) => {
  const task = findTask(req.params.id);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.json(task);
});

app.delete('/api/tasks/:id', (req, res) => {
  const idx = tasks.findIndex((t) => t.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  if (running.has(req.params.id)) {
    res.status(409).json({ error: 'Task is running' });
    return;
  }
  tasks.splice(idx, 1);
  scheduleSave();
  res.json({ ok: true });
});

app.post('/api/tasks/:id/stop', (req, res) => {
  const proc = running.get(req.params.id);
  if (!proc) {
    res.status(404).json({ error: 'Task not running' });
    return;
  }
  proc.kill('SIGTERM');
  updateTask(req.params.id, { status: 'stopped', progress: 0 });
  running.delete(req.params.id);
  res.json({ ok: true });
});

app.get('/api/tasks/:id/events', (req, res) => {
  const taskId = req.params.id;
  const task = findTask(taskId);
  if (!task) {
    res.status(404).end();
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(`event: task\ndata: ${JSON.stringify({ type: 'task', task })}\n\n`);

  const set = subscribers.get(taskId) ?? new Set();
  set.add(res);
  subscribers.set(taskId, set);

  req.on('close', () => {
    const current = subscribers.get(taskId);
    if (!current) return;
    current.delete(res);
    if (current.size === 0) subscribers.delete(taskId);
  });
});

function validateCreateTask(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid body' };
  const type = body.type;
  const configPath = body.configPath;
  if (type !== 'llm' && type !== 'web-vuln' && type !== 'recon' && type !== 'providers') {
    return { ok: false, error: 'Unsupported task type' };
  }
  if (typeof configPath !== 'string' || configPath.trim() === '') {
    return { ok: false, error: 'configPath is required' };
  }
  return { ok: true, type, configPath };
}

function ensureReportsDir() {
  fs.mkdirSync(reportsDir, { recursive: true });
}

function runCliTask(taskId, args, cwd) {
  const child = spawn('node', [cliPath, ...args], {
    cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  running.set(taskId, child);
  updateTask(taskId, { status: 'running', progress: 1, pid: child.pid });
  wsBroadcastAny({ type: 'stats' });

  const handleChunk = (chunk) => {
    const text = chunk.toString('utf-8');
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue;
      if (line.startsWith('NB_EVENT ')) {
        const v1 = parseJsonSafe(line.slice('NB_EVENT '.length));
        const et = v1?.eventType;
        const inner = v1?.payload;

        if (et === 'scan.case_end' && typeof inner?.index === 'number' && typeof inner?.total === 'number') {
          const pct = Math.max(0, Math.min(99, Math.round((inner.index / inner.total) * 99)));
          updateTask(taskId, { progress: pct });
        } else if (et === 'scan.scan_start' && typeof inner?.total === 'number') {
          updateTask(taskId, { progress: 1, totalCases: inner.total });
        } else if (et === 'web.case_end' && inner?.progress) {
          const pct = Math.max(0, Math.min(99, Math.round((inner.progress.current / inner.progress.total) * 99)));
          updateTask(taskId, { progress: pct });
        } else if (et === 'recon.port_progress' && inner?.progress) {
          const pct = Math.max(0, Math.min(99, Math.round((inner.progress.current / inner.progress.total) * 99)));
          updateTask(taskId, { progress: pct });
        } else if (et === 'recon.subdomain_progress' && inner?.progress) {
          const pct = Math.max(0, Math.min(99, Math.round((inner.progress.current / inner.progress.total) * 99)));
          updateTask(taskId, { progress: pct });
        }
        continue;
      }

      addLog(taskId, line);
      const match = line.match(/(\d{1,3})%/);
      if (match) {
        const value = Math.max(0, Math.min(99, Number(match[1])));
        updateTask(taskId, { progress: value });
      } else {
        const task = findTask(taskId);
        if (task && typeof task.progress === 'number' && task.progress < 95) {
          updateTask(taskId, { progress: task.progress + 1 });
        }
      }
    }
  };

  child.stdout.on('data', handleChunk);
  child.stderr.on('data', handleChunk);

  child.on('exit', (code) => {
    running.delete(taskId);
    const status = code === 0 ? 'completed' : 'failed';
    updateTask(taskId, { status, progress: 100, exitCode: code });
    broadcast(taskId, { type: 'done', exitCode: code });
    wsBroadcastAny({ type: 'stats' });
  });

  child.on('error', (err) => {
    running.delete(taskId);
    addLog(taskId, err.message);
    updateTask(taskId, { status: 'failed', progress: 100 });
    wsBroadcastAny({ type: 'stats' });
  });
}

app.post('/api/tasks', (req, res) => {
  const validated = validateCreateTask(req.body);
  if (!validated.ok) {
    res.status(400).json({ error: validated.error });
    return;
  }

  const id = `task-${Date.now()}`;
  const createdAt = nowIso();
  const task = {
    id,
    name: typeof req.body.name === 'string' && req.body.name.trim() ? req.body.name.trim() : id,
    type: validated.type,
    status: 'pending',
    progress: 0,
    createdAt,
    updatedAt: createdAt,
    configPath: validated.configPath,
    logs: [],
  };
  tasks.push(task);
  scheduleSave();

  try {
    ensureReportsDir();
    const relConfig = validated.configPath;
    if (validated.type === 'llm') {
      const outPath = join(reportsDir, `${id}.scan.json`);
      updateTask(id, { outputPath: outPath });

      let runConfigPath = relConfig;
      const settings = readSettings();
      if (Array.isArray(settings.enabledManifests) && settings.enabledManifests.length > 0) {
        try {
          const rawConfig = readJsonFile(join(rootDir, relConfig), {});
          rawConfig.bridge = rawConfig.bridge || {};
          rawConfig.bridge.manifestPaths = settings.enabledManifests;
          const tmpConfigPath = join(dataDir, `run_${id}.json`);
          writeJsonFile(tmpConfigPath, rawConfig);
          runConfigPath = tmpConfigPath;
        } catch (e) {
          console.error('Failed to inject manifests into config', e);
        }
      }

      runCliTask(id, ['scan', 'run', '--config', runConfigPath, '--output', outPath, '--report-format', 'json', '--json-events'], rootDir);
    } else if (validated.type === 'web-vuln') {
      const outPath = join(reportsDir, `${id}.vuln.json`);
      updateTask(id, { outputPath: outPath });
      runCliTask(id, ['web', 'vuln-scan', '--config', relConfig, '--output', outPath, '--report-format', 'json', '--json-events'], rootDir);
    } else if (validated.type === 'recon') {
      const outPath = join(reportsDir, `${id}.recon.json`);
      updateTask(id, { outputPath: outPath });
      runCliTask(id, ['recon', 'scan', '--output', outPath, '--report-format', 'json', '--hosts', relConfig, '--ports', '80', '--json-events'], rootDir);
    } else {
      runCliTask(id, ['providers', 'test', '--provider', 'openai-compatible', '--model', 'gpt-4o', '--base-url', relConfig], rootDir);
    }
  } catch (error) {
    updateTask(id, { status: 'failed', progress: 100 });
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to start task' });
    return;
  }

  res.json(findTask(id));
});

app.get('/api/reports', (req, res) => {
  try {
    ensureReportsDir();
    const entries = fs.readdirSync(reportsDir, { withFileTypes: true });
    const reports = entries
      .filter((e) => e.isFile())
      .map((e) => {
        const path = join(reportsDir, e.name);
        const stat = fs.statSync(path);
        return {
          id: e.name,
          path,
          size: stat.size,
          createdAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list reports' });
  }
});

app.get('/api/reports/:id/text', (req, res) => {
  try {
    const file = join(reportsDir, req.params.id);
    const content = fs.readFileSync(file, 'utf-8');
    res.json({ id: req.params.id, content });
  } catch (error) {
    res.status(404).json({ error: 'Report not found' });
  }
});

app.get('/api/reports/:id/download', (req, res) => {
  try {
    const file = join(reportsDir, req.params.id);
    res.download(file);
  } catch {
    res.status(404).end();
  }
});

// Fallback for React Router
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../dist/index.html'));
});

const PORT = process.env.PORT || 3001;
ensureWsSetup();
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
