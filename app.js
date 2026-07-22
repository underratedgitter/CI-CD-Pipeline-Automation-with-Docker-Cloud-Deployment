'use strict';

const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// GET / — Hello World
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Suraj' });
});

// GET /health — uptime & timestamp
app.get('/health', (req, res) => {
  res.json({
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Start server only when not required by tests
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
