let currentPeriod = '1d';
let marketDataCache = {};

// Period select change handler
document.getElementById('periodSelect').addEventListener('change', (e) => {
    currentPeriod = e.target.value;
    updateDisplay();
});

// Fetch all data for a symbol across all periods
async function fetchAllPeriodsForSymbol(symbol) {
    const proxyUrl = 'https://corsproxy.io/?';
    // Fetch 5 year data which includes all other periods
    const apiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5y&interval=1d`;

    try {
        const response = await fetch(proxyUrl + encodeURIComponent(apiUrl));
        const data = await response.json();

        if (data.chart.result && data.chart.result[0]) {
            const result = data.chart.result[0];
            const timestamps = result.timestamp;
            const prices = result.indicators.quote[0].close;
            const currentPrice = result.meta.regularMarketPrice || prices[prices.length - 1];

            // Calculate start prices for each period
            const now = Date.now() / 1000; // Current time in seconds
            const periods = {
                '1d': findPriceAtTime(timestamps, prices, now - (1 * 24 * 60 * 60)),
                '1w': findPriceAtTime(timestamps, prices, now - (7 * 24 * 60 * 60)),
                '1m': findPriceAtTime(timestamps, prices, now - (30 * 24 * 60 * 60)),
                '1y': findPriceAtTime(timestamps, prices, now - (365 * 24 * 60 * 60)),
                '5y': prices.find(p => p !== null)
            };

            return {
                currentPrice,
                periods
            };
        }
    } catch (error) {
        console.error(`Error fetching ${symbol}:`, error);
        return null;
    }
}

// Find the closest price to a given timestamp
function findPriceAtTime(timestamps, prices, targetTime) {
    let closestIndex = 0;
    let minDiff = Math.abs(timestamps[0] - targetTime);

    for (let i = 1; i < timestamps.length; i++) {
        const diff = Math.abs(timestamps[i] - targetTime);
        if (diff < minDiff) {
            minDiff = diff;
            closestIndex = i;
        }
    }

    // Find the first non-null price at or after this index
    for (let i = closestIndex; i < prices.length; i++) {
        if (prices[i] !== null) {
            return prices[i];
        }
    }
    // If no non-null price found forward, search backward
    for (let i = closestIndex; i >= 0; i--) {
        if (prices[i] !== null) {
            return prices[i];
        }
    }
    return null;
}

// Update display based on current period
function updateDisplay() {
    const instruments = [
        { id: 'vdhg', symbol: 'VDHG.AX' },
        { id: 'asx200', symbol: '^AXJO' },
        { id: 'sp500', symbol: '^GSPC' },
        { id: 'gold', symbol: 'GOLD.AX' },
        { id: 'bitcoin', symbol: 'BTC-AUD' }
    ];

    instruments.forEach(({ id, symbol }) => {
        const data = marketDataCache[symbol];
        if (!data) return;

        const currentPrice = data.currentPrice;
        const startPrice = data.periods[currentPeriod];

        if (startPrice) {
            const change = currentPrice - startPrice;
            const changePercent = (change / startPrice) * 100;

            // Update price
            document.getElementById(`${id}-price`).textContent =
                currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            // Update change
            const changeElement = document.getElementById(`${id}-change`);
            const changeText = `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent.toFixed(2)}%)`;
            changeElement.textContent = changeText;

            // Color based on change
            if (change >= 0) {
                changeElement.className = 'text-sm font-semibold text-green-500';
            } else {
                changeElement.className = 'text-sm font-semibold text-red-500';
            }
        }
    });
}

// Initial load - fetch all data in parallel
async function loadAllData() {
    try {
        // Fetch all symbols in parallel
        const [vdhgData, asx200Data, sp500Data, goldData, bitcoinData] = await Promise.all([
            fetchAllPeriodsForSymbol('VDHG.AX'),
            fetchAllPeriodsForSymbol('^AXJO'),
            fetchAllPeriodsForSymbol('^GSPC'),
            fetchAllPeriodsForSymbol('GOLD.AX'),
            fetchAllPeriodsForSymbol('BTC-AUD')
        ]);

        // Cache the data
        marketDataCache['VDHG.AX'] = vdhgData;
        marketDataCache['^AXJO'] = asx200Data;
        marketDataCache['^GSPC'] = sp500Data;
        marketDataCache['GOLD.AX'] = goldData;
        marketDataCache['BTC-AUD'] = bitcoinData;

        // Update the display
        updateDisplay();
    } catch (error) {
        console.error('Error loading market data:', error);
    }
}

// Start loading data
loadAllData();

// Refresh data every 5 minutes (300000 milliseconds)
setInterval(loadAllData, 300000);
