'use strict';

const express = require('express');
const path = require('path');
const createApiRouter = require('./routes/api');

const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, 'data');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/data', express.static(DATA_DIR));
app.use(
  '/api',
  createApiRouter({
    dataDir: DATA_DIR,
    adminKey: process.env.ADMIN_KEY || 'coach-ops'
  })
);

app.get('/admin', (req, res) => {
  res.redirect('/admin.html');
});

app.listen(PORT, () => {
  console.log(`Coach Position display: http://localhost:${PORT}/?station=BG&display=entrance-main`);
  console.log(`Admin: http://localhost:${PORT}/admin.html (key: coach-ops)`);
  console.log('Data source: NTES Live Station (halts only — no demo board)');
});
