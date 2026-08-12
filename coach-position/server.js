'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const createApiRouter = require('./routes/api');

const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, 'data');

function loadDemoBoard() {
  try {
    const trains = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'demo_board.json'), 'utf8'));
    // Shift demo times so at least one train is within the 10-minute window
    const now = new Date();
    const mk = (addMin) => {
      const d = new Date(now.getTime() + addMin * 60_000);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };
    return trains.map((t, i) => {
      const eta = mk(5 + i * 3);
      return {
        ...t,
        expectedArrival: t.expectedArrival ? eta : null,
        expectedDeparture: eta,
        scheduledArrival: t.scheduledArrival ? eta : null,
        scheduledDeparture: eta
      };
    });
  } catch {
    return [];
  }
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  '/api',
  createApiRouter({
    dataDir: DATA_DIR,
    getBoardTrains: loadDemoBoard,
    adminKey: process.env.ADMIN_KEY || 'coach-ops'
  })
);

app.get('/admin', (req, res) => {
  res.redirect('/admin.html');
});

app.listen(PORT, () => {
  console.log(`Coach Position display: http://localhost:${PORT}/?display=entrance-main`);
  console.log(`Admin: http://localhost:${PORT}/admin.html (key: coach-ops)`);
});
