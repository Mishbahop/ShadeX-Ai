const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const https = require('https');

const app = express();

// Parse JSON bodies
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// CORS middleware - must be first!
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') {
    console.log(`[CORS] Preflight OPTIONS for ${req.url}`);
    return res.sendStatus(204);
  }
  
  next();
});

// Initialize data
const OFFICIAL_HOST = 'draw.ar-lottery06.com';
const OFFICIAL_ENDPOINT = '/WinGo/WinGo_30S/GetHistoryIssuePage.json';
const MAX_HISTORY_ENTRIES = 12;
const pendingPredictions = [];
const processedPeriods = new Set();
const statsState = {
  winRate: 0,
  totalWins: 0,
  totalLosses: 0,
  streak: '',
  lastFive: ''
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

function determineCategory(number) {
  const normalized = Number(number);
  if (Number.isNaN(normalized)) return 'Unknown';
  return normalized >= 5 ? 'Big' : 'Small';
}

function createRankedPredictions(base) {
  const pivot = Number(base) || 0;
  return Array.from({ length: 3 }, (_, index) => ({
    number: String((pivot + index) % 10)
  }));
}

function updateWinRate() {
  const total = statsState.totalWins + statsState.totalLosses;
  statsState.winRate = total ? Math.min(99, Math.round((statsState.totalWins / total) * 100)) : 0;
}

function updateHistoryMetadata() {
  const recent = pendingPredictions.slice(0, 5);
  statsState.lastFive = recent.map(entry => entry.prediction).join(',') || '';
  statsState.streak = recent
    .map(entry => (entry.status === 'win' ? 'W' : entry.status === 'loss' ? 'L' : 'P'))
    .join('');
}

function addPredictionRecord(record) {
  pendingPredictions.unshift(record);
  if (pendingPredictions.length > MAX_HISTORY_ENTRIES) {
    pendingPredictions.pop();
  }
  if (record.status === 'win') {
    statsState.totalWins += 1;
    processedPeriods.add(record.period);
  } else if (record.status === 'loss') {
    statsState.totalLosses += 1;
    processedPeriods.add(record.period);
  }
  updateWinRate();
  updateHistoryMetadata();
}

function fetchOfficialHistory() {
  return new Promise((resolve, reject) => {
    const requestUrl = new URL(OFFICIAL_ENDPOINT, `https://${OFFICIAL_HOST}`);
    requestUrl.searchParams.set('ts', Date.now().toString());
    const req = https.get(requestUrl, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Unexpected HTTP status ${res.statusCode}`));
      }
      let responseData = '';
      res.on('data', chunk => {
        responseData += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => {
      req.destroy(new Error('WinGo history request timeout'));
    });
  });
}

async function buildPredictionResult() {
  let officialEntry;
  try {
    const history = await fetchOfficialHistory();
    const list = history?.data?.list;
    if (Array.isArray(list) && list.length > 0) {
      officialEntry = list[0];
    }
  } catch (error) {
    console.warn(`[WinGo] Failed to fetch official history: ${error.message}`);
  }

  const period = officialEntry?.issueNumber || getPeriodIdentifier();
  if (officialEntry && processedPeriods.has(period)) {
    const existing = pendingPredictions.find(entry => entry.period === period);
    if (existing) {
      return {
        status: 'OK',
        predictionResult: existing,
        pendingPredictions
      };
    }
  }

  const prediction = String(Math.floor(Math.random() * 10));
  const confidence = Math.floor(65 + Math.random() * 30);
  const rankedPredictions = createRankedPredictions(prediction);
  const actual = officialEntry?.number;
  const category = officialEntry ? determineCategory(actual) : (Math.random() > 0.5 ? 'Big' : 'Small');
  const status = actual ? (prediction === actual ? 'win' : 'loss') : 'pending';

  const record = {
    period,
    prediction,
    status,
    confidence,
    rankedPredictions,
    category,
    actual,
    color: officialEntry?.color
  };

  if (actual) {
    addPredictionRecord(record);
  }

  return {
    status: 'OK',
    predictionResult: record,
    pendingPredictions
  };
}

// ========== API ROUTES - MUST COME BEFORE STATIC MIDDLEWARE ==========

// POST /user/Game/api.php
app.post('/user/Game/api.php', async (req, res) => {
  const { action, mode } = req.body || {};
  console.log(`[${new Date().toISOString()}] POST /user/Game/api.php - action=${action}, mode=${mode}`);

  try {
    if (action === 'getPrediction') {
      const result = await buildPredictionResult();
      console.log(`  ✓ Returning prediction: ${result.predictionResult.prediction}`);
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
      console.log(`  ✓ Returning stats: ${stats.winRate}%`);
      return res.json(stats);
    }

    if (action === 'deleteItem') {
      const index = req.body.index || 0;
      if (index >= 0 && index < pendingPredictions.length) {
        pendingPredictions.splice(index, 1);
        updateHistoryMetadata();
      }
      return res.json({ status: 'OK', success: true, pendingPredictions });
    }

    if (action === 'deleteAll') {
      pendingPredictions.length = 0;
      updateHistoryMetadata();
      return res.json({ status: 'OK', success: true, pendingPredictions: [] });
    }

    console.log(`  ✗ Unknown action: ${action}`);
    return res.status(400).json({ status: 'Request Failed', message: 'Unknown action' });
  } catch (error) {
    console.error(`  ✗ Error handling ${action}:`, error.message);
    return res.status(500).json({ status: 'Error', message: error.message });
  }
});

// ========== STATIC FILES - COMES AFTER API ROUTES ==========
app.use(express.static(path.resolve(__dirname)));

// 404 handler
app.use((req, res) => {
  console.log(`[404] ${req.method} ${req.url}`);
  res.status(404).json({ status: 'Not Found', message: `Route not found: ${req.method} ${req.url}` });
});

const port = process.env.PORT || 4000;
app.listen(port, '0.0.0.0', () => console.log(`✓ Mock server listening on http://0.0.0.0:${port}`));
