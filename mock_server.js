const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
app.use(bodyParser.json());

// CORS middleware - must be first!
app.use((req, res, next) => {
  // Log all incoming requests
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  
  // Always set CORS headers
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Max-Age', '86400');
  
  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    console.log(`  -> Responding to preflight with 204`);
    return res.sendStatus(204);
  }
  
  next();
});

// Normalize incoming request URL to replace backslashes with forward slashes
app.use((req, res, next) => {
  if (req.url && req.url.includes('\\')) {
    req.url = req.url.replace(/\\/g, '/');
  }
  next();
});

const pendingPredictions = [];
const statsState = {
  winRate: 60,
  totalWins: 120,
  totalLosses: 70,
  streak: 'WWLW',
  lastFive: '7,3,1,5,2'
};

function getPeriodIdentifier() {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const totalMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const suffix = String(totalMinutes).padStart(4, '0');
  return `${yyyy}${mm}${dd}-${suffix}`;
}

function buildPredictionResult() {
  const period = getPeriodIdentifier();
  const prediction = String(Math.floor(Math.random() * 10));
  const confidence = Math.floor(50 + Math.random() * 40);
  const rankedPredictions = Array.from({ length: 3 }, () => ({
    number: String(Math.floor(1 + Math.random() * 9))
  }));
  const isResolved = Math.random() > 0.3;
  const status = isResolved ? (Math.random() > 0.5 ? 'win' : 'loss') : 'pending';
  const bigSmall = Math.random() > 0.5 ? 'Big' : 'Small';
  const category = bigSmall.toLowerCase();

  pendingPredictions.unshift({
    period,
    prediction,
    status,
    confidence,
    category,
    actual: isResolved ? (status === 'win' ? 'Win' : 'Loss') : undefined
  });
  if (pendingPredictions.length > 5) {
    pendingPredictions.pop();
  }

  const shouldCountWin = Math.random() > 0.4;
  statsState.totalWins += shouldCountWin ? 1 : 0;
  statsState.totalLosses += shouldCountWin ? 0 : 1;
  const totalGames = statsState.totalWins + statsState.totalLosses;
  statsState.winRate = Math.min(95, Math.max(30, Math.round((statsState.totalWins / Math.max(1, totalGames)) * 100)));
  const lastFive = [];
  for (let i = 0; i < 5; i += 1) {
    lastFive.push(String(Math.floor(Math.random() * 10)));
  }
  statsState.lastFive = lastFive.join(',');
  const streak = [];
  for (let i = 0; i < 5; i += 1) {
    streak.push(Math.random() > 0.5 ? 'W' : 'L');
  }
  statsState.streak = streak.join('');

  return {
    status: 'OK',
    predictionResult: {
      period,
      prediction,
      confidence,
      rankedPredictions,
      category: bigSmall,
      status
    },
    pendingPredictions
  };
}

app.post('/user/Game/api.php', (req, res) => {
  const { action, mode } = req.body;
  console.log(`[POST /user/Game/api.php] action=${action}, mode=${mode}`);
  console.log(`  body: ${JSON.stringify(req.body)}`);

  if (action === 'getPrediction') {
    const result = buildPredictionResult();
    console.log(`  -> Returning prediction: ${result.predictionResult.prediction}, period: ${result.predictionResult.period}`);
    return res.json(result);
  }

  if (action === 'getStats') {
    const stats = {
      status: 'OK',
      winRate: statsState.winRate,
      totalWins: statsState.totalWins,
      totalLosses: statsState.totalLosses,
      streak: statsState.streak,
      lastFive: statsState.lastFive
    };
    console.log(`  -> Returning stats: winRate=${stats.winRate}%, wins=${stats.totalWins}, losses=${stats.totalLosses}`);
    return res.json(stats);
  }

  if (action === 'deleteItem') {
    const index = req.body.index || 0;
    if (index >= 0 && index < pendingPredictions.length) {
      pendingPredictions.splice(index, 1);
      console.log(`  -> Deleted item at index ${index}, remaining: ${pendingPredictions.length}`);
    }
    return res.json({ status: 'OK', success: true, pendingPredictions });
  }

  if (action === 'deleteAll') {
    const count = pendingPredictions.length;
    pendingPredictions.length = 0;
    console.log(`  -> Cleared all ${count} pending predictions`);
    return res.json({ status: 'OK', success: true, pendingPredictions: [] });
  }

  console.log(`  -> Unknown action: ${action}`);
  return res.json({ status: 'Request Failed', message: 'Unknown action' });
});

// Serve static files from this folder (so you can open local HTML files)
// Must come AFTER the API route so the POST handler is checked first
app.use(express.static(path.resolve(__dirname)));

const port = 3000;
app.listen(port, () => console.log(`Mock server listening on http://localhost:${port}`));
