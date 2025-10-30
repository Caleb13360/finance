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

// Salary calculation multipliers
const SALARY_MULTIPLIERS = {
    weekly: 52,
    biweekly: 26,
    monthly: 12,
    yearly: 1
};

// Australian tax brackets (2024-2025)
const TAX_BRACKETS = [
    { min: 0, max: 18200, rate: 0, baseAmount: 0 },
    { min: 18201, max: 45000, rate: 0.16, baseAmount: 0 },
    { min: 45001, max: 135000, rate: 0.30, baseAmount: 4288 },
    { min: 135001, max: 190000, rate: 0.37, baseAmount: 31288 },
    { min: 190001, max: Infinity, rate: 0.45, baseAmount: 51638 }
];

// Query parameter utilities
function getQueryParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        salary: params.get('salary') || '',
        period: params.get('period') || 'yearly',
        investment: params.get('investment') || '',
        investmentPeriod: params.get('investmentPeriod') || 'yearly'
    };
}

function updateQueryParams(salary, period, investment, investmentPeriod) {
    const url = new URL(window.location);
    if (salary) {
        url.searchParams.set('salary', salary);
        url.searchParams.set('period', period);
    } else {
        url.searchParams.delete('salary');
        url.searchParams.delete('period');
    }
    if (investment) {
        url.searchParams.set('investment', investment);
        url.searchParams.set('investmentPeriod', investmentPeriod);
    } else {
        url.searchParams.delete('investment');
        url.searchParams.delete('investmentPeriod');
    }
    window.history.replaceState({}, '', url);
}

// Calculate yearly salary
function calculateYearlySalary(amount, period) {
    if (!amount || isNaN(amount) || amount <= 0) return 0;
    return amount * SALARY_MULTIPLIERS[period];
}

// Calculate tax breakdown by bracket
function calculateTaxBreakdown(yearlySalary) {
    if (yearlySalary <= 0) {
        return { totalTax: 0, afterTax: 0, brackets: [] };
    }

    let totalTax = 0;
    const brackets = [];

    for (const bracket of TAX_BRACKETS) {
        if (yearlySalary <= bracket.min) break;

        const incomeInBracket = Math.min(yearlySalary, bracket.max) - bracket.min;
        const taxInBracket = incomeInBracket * bracket.rate;

        totalTax += taxInBracket;

        brackets.push({
            min: bracket.min,
            max: bracket.max === Infinity ? null : bracket.max,
            rate: bracket.rate,
            incomeInBracket,
            taxInBracket,
            salaryInBracket: incomeInBracket - taxInBracket
        });
    }

    return {
        totalTax,
        afterTax: yearlySalary - totalTax,
        brackets
    };
}

// Update salary display
function updateSalaryDisplay(triggerInvestmentUpdate = true) {
    const salaryInput = document.getElementById('salaryInput');
    const salaryPeriod = document.getElementById('salaryPeriod');
    const yearlySalary = document.getElementById('yearlySalary');
    const afterTaxSalary = document.getElementById('afterTaxSalary');
    const taxBreakdownContainer = document.getElementById('taxBreakdown');

    const amount = parseFloat(salaryInput.value) || 0;
    const period = salaryPeriod.value;
    const yearly = calculateYearlySalary(amount, period);
    const taxData = calculateTaxBreakdown(yearly);

    yearlySalary.textContent = `$${yearly.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    afterTaxSalary.textContent = `$${taxData.afterTax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Render tax breakdown bars
    renderTaxBreakdown(taxData.brackets, taxBreakdownContainer);

    // Update investment calculator (only if not during initialization)
    if (triggerInvestmentUpdate) {
        updateInvestmentDisplay();
    }
}

// Calculate yearly investment
function calculateYearlyInvestment(amount, period) {
    if (!amount || isNaN(amount) || amount <= 0) return 0;
    return amount * SALARY_MULTIPLIERS[period];
}

// Update investment display
function updateInvestmentDisplay() {
    const investmentInput = document.getElementById('investmentInput');
    const investmentPeriod = document.getElementById('investmentPeriod');
    const yearlyInvestment = document.getElementById('yearlyInvestment');
    const incomeAfterInvestment = document.getElementById('incomeAfterInvestment');

    const salaryInput = document.getElementById('salaryInput');
    const salaryPeriod = document.getElementById('salaryPeriod');

    const investmentAmount = parseFloat(investmentInput.value) || 0;
    const investmentPer = investmentPeriod.value;
    const yearlyInv = calculateYearlyInvestment(investmentAmount, investmentPer);

    // Get after-tax income
    const salaryAmount = parseFloat(salaryInput.value) || 0;
    const period = salaryPeriod.value;
    const yearly = calculateYearlySalary(salaryAmount, period);
    const taxData = calculateTaxBreakdown(yearly);
    const afterTax = taxData.afterTax;

    // Calculate income after investment
    const incomeAfterInv = afterTax - yearlyInv;

    yearlyInvestment.textContent = `$${yearlyInv.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    incomeAfterInvestment.textContent = `$${incomeAfterInv.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Update query params
    const salary = salaryAmount > 0 ? salaryAmount : '';
    const investment = investmentAmount > 0 ? investmentAmount : '';
    updateQueryParams(salary, period, investment, investmentPer);
}

// Render tax breakdown visualization
function renderTaxBreakdown(brackets, container) {
    if (brackets.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-4">Enter an income amount to see tax breakdown</p>';
        return;
    }

    container.innerHTML = brackets.map(bracket => {
        const totalInBracket = bracket.incomeInBracket;
        const salaryPercent = (bracket.salaryInBracket / totalInBracket * 100).toFixed(1);
        const taxPercent = (bracket.taxInBracket / totalInBracket * 100).toFixed(1);

        const bracketLabel = bracket.max
            ? `$${bracket.min.toLocaleString()} – $${bracket.max.toLocaleString()}`
            : `$${bracket.min.toLocaleString()}+`;

        return `
            <div class="mb-6">
                <div class="flex justify-between items-center mb-2">
                    <span class="text-gray-300 text-sm font-medium">${bracketLabel} (${(bracket.rate * 100).toFixed(0)}% rate)</span>
                    <span class="text-gray-400 text-xs">Total: $${totalInBracket.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div class="flex h-10 rounded-lg overflow-hidden border border-gray-600">
                    <div class="bg-green-500 flex items-center justify-center text-white text-xs font-semibold" style="width: ${salaryPercent}%">
                        <span class="px-2">$${bracket.salaryInBracket.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                    </div>
                    ${bracket.rate > 0 ? `<div class="bg-red-500 flex items-center justify-center text-white text-xs font-semibold" style="width: ${taxPercent}%">
                        <span class="px-2">$${bracket.taxInBracket.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                    </div>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Initialize salary calculator
function initSalaryCalculator() {
    const salaryInput = document.getElementById('salaryInput');
    const salaryPeriod = document.getElementById('salaryPeriod');

    // Load from query params
    const { salary, period } = getQueryParams();
    if (salary) {
        salaryInput.value = salary;
    }
    salaryPeriod.value = period;

    // Attach event listeners
    salaryInput.addEventListener('input', updateSalaryDisplay);
    salaryPeriod.addEventListener('change', updateSalaryDisplay);

    // Toggle breakdown visibility
    const toggleButton = document.getElementById('toggleBreakdown');
    const breakdownContainer = document.getElementById('taxBreakdown');
    const breakdownArrow = document.getElementById('breakdownArrow');

    toggleButton.addEventListener('click', () => {
        const isExpanded = toggleButton.getAttribute('aria-expanded') === 'true';
        toggleButton.setAttribute('aria-expanded', !isExpanded);
        breakdownContainer.classList.toggle('hidden');
        breakdownArrow.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
    });

    // Initial calculation (don't trigger investment update yet)
    updateSalaryDisplay(false);
}

// Initialize investment calculator
function initInvestmentCalculator() {
    const investmentInput = document.getElementById('investmentInput');
    const investmentPeriodSelect = document.getElementById('investmentPeriod');

    // Load from query params
    const { investment, investmentPeriod } = getQueryParams();
    if (investment) {
        investmentInput.value = investment;
    }
    investmentPeriodSelect.value = investmentPeriod;

    // Attach event listeners
    investmentInput.addEventListener('input', updateInvestmentDisplay);
    investmentPeriodSelect.addEventListener('change', updateInvestmentDisplay);

    // Initial calculation
    updateInvestmentDisplay();
}

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
        initSalaryCalculator();
        initInvestmentCalculator();
        setInterval(loadMarketData, REFRESH_INTERVAL);
    } catch (error) {
        console.error('Error initializing app:', error);
    }
}

// Start
init();
