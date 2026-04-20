import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend files in production
app.use(express.static(join(__dirname, '../dist')));

// System stats
app.get('/api/sys/stats', (req, res) => {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      total += cpu.times[type];
    }
    idle += cpu.times.idle;
  }
  const cpuUsage = 100 - ~~(100 * idle / total);
  
  res.json({
    cpuUsage,
    memoryUsage: process.memoryUsage(),
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    uptime: os.uptime(),
    activeTasks: 0
  });
});

// Mock tasks API
app.get('/api/tasks', (req, res) => {
  res.json([]);
});

app.post('/api/tasks', (req, res) => {
  res.json({ id: 'mock-task-id', status: 'running' });
});

// Fallback for React Router
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../dist/index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});