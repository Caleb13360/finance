// Configuration
const INSTRUMENTS = [
    { id: 'vdhg', symbol: 'VDHG.AX' },
    { id: 'asx200', symbol: '^AXJO' },
    { id: 'sp500', symbol: '^GSPC' },
    { id: 'gold', symbol: 'GOLD.AX' },
    { id: 'bitcoin', symbol: 'BTC-AUD' }
];

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const PROXY_URL = 'https://corsproxy.io/?';
const SECONDS_IN_DAY = 24 * 60 * 60;

// State
let currentPeriod = '1d';
const marketDataCache = {};

// Load header HTML
async function loadHeader() {
    const response = await fetch('header.html');
    const html = await response.text();
    document.getElementById('header-container').innerHTML = html;

    // Attach period selector handler
    document.getElementById('periodSelect').addEventListener('change', (e) => {
        currentPeriod = e.target.value;
        updateDisplay();
    });
}

// Find the closest non-null price to a target timestamp
function findPriceAtTime(timestamps, prices, targetTime) {
    // Find closest timestamp
    const closestIndex = timestamps.reduce((bestIdx, timestamp, idx) => {
        const currentDiff = Math.abs(timestamp - targetTime);
        const bestDiff = Math.abs(timestamps[bestIdx] - targetTime);
        return currentDiff < bestDiff ? idx : bestIdx;
    }, 0);

    // Find nearest non-null price (search forward then backward)
    return prices.slice(closestIndex).find(p => p !== null)
        || prices.slice(0, closestIndex + 1).reverse().find(p => p !== null);
}

// Fetch market data for a symbol
async function fetchSymbolData(symbol) {
    const apiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5y&interval=1d`;
    const response = await fetch(PROXY_URL + encodeURIComponent(apiUrl));
    const data = await response.json();

    const result = data.chart?.result?.[0];
    if (!result) throw new Error(`No data for ${symbol}`);

    const { timestamp: timestamps, indicators } = result;
    const prices = indicators.quote[0].close;
    const currentPrice = result.meta.regularMarketPrice || prices[prices.length - 1];

    // Calculate period start prices
    const now = Date.now() / 1000;
    const periods = {
        '1d': findPriceAtTime(timestamps, prices, now - SECONDS_IN_DAY),
        '1w': findPriceAtTime(timestamps, prices, now - 7 * SECONDS_IN_DAY),
        '1m': findPriceAtTime(timestamps, prices, now - 30 * SECONDS_IN_DAY),
        '1y': findPriceAtTime(timestamps, prices, now - 365 * SECONDS_IN_DAY),
        '5y': prices.find(p => p !== null)
    };

    return { currentPrice, periods };
}

// Update UI for a single instrument
function updateInstrument(id, data) {
    const startPrice = data.periods[currentPeriod];
    if (!startPrice) return;

    const { currentPrice } = data;
    const change = currentPrice - startPrice;
    const changePercent = (change / startPrice) * 100;

    // Update price display
    document.getElementById(`${id}-price`).textContent =
        currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Update change display
    const changeElement = document.getElementById(`${id}-change`);
    changeElement.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent.toFixed(2)}%)`;
    changeElement.className = `text-sm font-semibold ${change >= 0 ? 'text-green-500' : 'text-red-500'}`;
}

// Update all displayed data
function updateDisplay() {
    INSTRUMENTS.forEach(({ id, symbol }) => {
        const data = marketDataCache[symbol];
        if (data) updateInstrument(id, data);
    });
}

// Load all market data
async function loadMarketData() {
    try {
        const results = await Promise.all(
            INSTRUMENTS.map(({ symbol }) => fetchSymbolData(symbol).catch(err => {
                console.error(`Error fetching ${symbol}:`, err);
                return null;
            }))
        );

        // Cache results
        INSTRUMENTS.forEach(({ symbol }, i) => {
            if (results[i]) marketDataCache[symbol] = results[i];
        });

        updateDisplay();
    } catch (error) {
        console.error('Error loading market data:', error);
    }
}

// Initialize application
async function init() {
    try {
        await loadHeader();
        await loadMarketData();
        setInterval(loadMarketData, REFRESH_INTERVAL);
    } catch (error) {
        console.error('Error initializing app:', error);
    }
}

// Start
init();
