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
let isInitializing = true;

// Salary calculation multipliers
const SALARY_MULTIPLIERS = {
    weekly: 52,
    biweekly: 26,
    monthly: 12,
    yearly: 1
};

// Investment return rates (annual)
const INVESTMENT_RATES = {
    'spending-account': 0.0005,  // 0.05%
    'savings-account': 0.035,    // 3.5%
    'term-deposit': 0.04,        // 4%
    'vdhg': 0.1009,              // 10.09%
    'aus-market': 0.106,         // 10.6%
    'us-market': 0.104,          // 10.4%
    'gold': 0.08,                // 8%
    'bitcoin': 0.50              // 50%
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
        investmentPeriod: params.get('investmentPeriod') || 'yearly',
        startingAmount: params.get('startingAmount') || '',
        investmentType: params.get('investmentType') || 'vdhg',
        investmentDuration: params.get('investmentDuration') || ''
    };
}

function updateQueryParams(salary, period, investment, investmentPeriod, startingAmount, investmentType, investmentDuration) {
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
    if (startingAmount) {
        url.searchParams.set('startingAmount', startingAmount);
        url.searchParams.set('investmentType', investmentType);
    } else {
        url.searchParams.delete('startingAmount');
        url.searchParams.delete('investmentType');
    }
    if (investmentDuration) {
        url.searchParams.set('investmentDuration', investmentDuration);
    } else {
        url.searchParams.delete('investmentDuration');
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

// Calculate investment gains with precise compounding
function calculateInvestmentGains(startingAmount, periodicAmount, period, investmentType) {
    const rate = INVESTMENT_RATES[investmentType] || 0;

    // Gain from starting amount (grows for full year)
    const startingGain = startingAmount * rate;

    // Calculate periodic investment gains precisely
    const periodsPerYear = SALARY_MULTIPLIERS[period];
    let periodicGains = 0;

    // For each contribution period, calculate how much it grows
    for (let i = 1; i <= periodsPerYear; i++) {
        // Time remaining in year for this contribution (as fraction of year)
        const timeRemaining = (periodsPerYear - i + 1) / periodsPerYear;

        // Future value of this contribution
        const futureValue = periodicAmount * Math.pow(1 + rate, timeRemaining);

        // Gain from this contribution
        periodicGains += (futureValue - periodicAmount);
    }

    return {
        startingGain,
        periodicGains,
        totalGain: startingGain + periodicGains
    };
}

// Calculate future value over multiple years with compounding (supports decimal years)
function calculateFutureValue(startingAmount, periodicAmount, period, investmentType, years) {
    if (!years || years <= 0) {
        return {
            futureValue: 0,
            totalContributions: 0,
            totalGains: 0
        };
    }

    const rate = INVESTMENT_RATES[investmentType] || 0;
    const periodsPerYear = SALARY_MULTIPLIERS[period];

    let balance = startingAmount;
    let totalContributions = startingAmount;

    // Calculate whole years and fractional year separately
    const wholeYears = Math.floor(years);
    const fractionalYear = years - wholeYears;

    // Process complete years
    for (let year = 0; year < wholeYears; year++) {
        // Grow the current balance by one year
        balance *= (1 + rate);

        // Add periodic contributions throughout the year
        // Each contribution grows from the point it's added until year end
        for (let periodNum = 1; periodNum <= periodsPerYear; periodNum++) {
            // Time remaining in the year when this contribution is made
            const timeRemaining = (periodsPerYear - periodNum + 1) / periodsPerYear;

            // Add the contribution and grow it for the remainder of the year
            const contributionGrowth = periodicAmount * Math.pow(1 + rate, timeRemaining);
            balance += contributionGrowth;
            totalContributions += periodicAmount;
        }
    }

    // Process fractional year if present
    if (fractionalYear > 0) {
        // Grow existing balance for the fractional year
        balance *= Math.pow(1 + rate, fractionalYear);

        // Add contributions for the fractional year
        const periodsInFractionalYear = periodsPerYear * fractionalYear;
        const completePeriodsInFractionalYear = Math.floor(periodsInFractionalYear);

        for (let periodNum = 1; periodNum <= completePeriodsInFractionalYear; periodNum++) {
            // Time remaining in the fractional year when this contribution is made
            const timeRemaining = (periodsInFractionalYear - periodNum + 1) / periodsPerYear;

            // Add the contribution and grow it for the remainder of the fractional year
            const contributionGrowth = periodicAmount * Math.pow(1 + rate, timeRemaining);
            balance += contributionGrowth;
            totalContributions += periodicAmount;
        }
    }

    const totalGains = balance - totalContributions;

    return {
        futureValue: balance,
        totalContributions,
        totalGains
    };
}

// Calculate required duration to reach a target value using binary search
function calculateRequiredDuration(startingAmount, periodicAmount, period, investmentType, targetValue) {
    if (targetValue <= startingAmount) {
        return 0;
    }

    const rate = INVESTMENT_RATES[investmentType] || 0;
    if (rate <= 0) {
        // If no growth rate, calculate based on contributions alone
        const yearlyContribution = periodicAmount * SALARY_MULTIPLIERS[period];
        if (yearlyContribution <= 0) return 0;
        return (targetValue - startingAmount) / yearlyContribution;
    }

    // Binary search for the duration
    let low = 0;
    let high = 100; // Start with max 100 years
    const tolerance = 0.001; // Tolerance for convergence (0.001 years = ~0.4 days)

    // First check if 100 years is enough
    let testResult = calculateFutureValue(startingAmount, periodicAmount, period, investmentType, high);
    if (testResult.futureValue < targetValue) {
        // Need more than 100 years, extend the search
        high = 200;
        testResult = calculateFutureValue(startingAmount, periodicAmount, period, investmentType, high);
        if (testResult.futureValue < targetValue) {
            return 200; // Cap at 200 years
        }
    }

    // Binary search
    let iterations = 0;
    const maxIterations = 100;
    while (high - low > tolerance && iterations < maxIterations) {
        const mid = (low + high) / 2;
        const result = calculateFutureValue(startingAmount, periodicAmount, period, investmentType, mid);

        if (Math.abs(result.futureValue - targetValue) < 0.01) {
            return mid;
        }

        if (result.futureValue < targetValue) {
            low = mid;
        } else {
            high = mid;
        }

        iterations++;
    }

    return (low + high) / 2;
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
    updateAllQueryParams();
}

// Update all query parameters from all form fields
function updateAllQueryParams() {
    // Don't update query params during initialization to avoid overwriting loaded values
    if (isInitializing) {
        return;
    }

    const salaryInput = document.getElementById('salaryInput');
    const salaryPeriod = document.getElementById('salaryPeriod');
    const investmentInput = document.getElementById('investmentInput');
    const investmentPeriod = document.getElementById('investmentPeriod');
    const startingAmountInput = document.getElementById('startingAmount');
    const investmentTypeSelect = document.getElementById('investmentType');
    const investmentDurationInput = document.getElementById('investmentDuration');

    const salaryAmount = parseFloat(salaryInput.value) || 0;
    const period = salaryPeriod.value;
    const investmentAmount = parseFloat(investmentInput.value) || 0;
    const investmentPer = investmentPeriod.value;
    const startingAmount = startingAmountInput ? (parseFloat(startingAmountInput.value) || 0) : 0;
    const investmentType = investmentTypeSelect ? investmentTypeSelect.value : 'vdhg';
    const investmentDuration = investmentDurationInput ? (parseFloat(investmentDurationInput.value) || 0) : 0;

    const salary = salaryAmount > 0 ? salaryAmount : '';
    const investment = investmentAmount > 0 ? investmentAmount : '';
    const starting = startingAmount > 0 ? startingAmount : '';
    const duration = investmentDuration > 0 ? investmentDuration : '';
    updateQueryParams(salary, period, investment, investmentPer, starting, investmentType, duration);
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

    // Attach event listeners - update both displays
    const updateBoth = () => {
        updateInvestmentDisplay();
        updateInvestmentCalculatorCard();
    };
    investmentInput.addEventListener('input', updateBoth);
    investmentPeriodSelect.addEventListener('change', updateBoth);

    // Initial calculation
    updateInvestmentDisplay();
}

// Track which field is in input mode (duration or value)
let inputMode = 'duration'; // 'duration' or 'value'

// Update Investment Calculator card display from duration change
function updateInvestmentCalculatorCardFromDuration() {
    const startingAmountInput = document.getElementById('startingAmount');
    const investmentTypeSelect = document.getElementById('investmentType');
    const investmentInput = document.getElementById('investmentInput');
    const investmentPeriod = document.getElementById('investmentPeriod');
    const investmentDurationInput = document.getElementById('investmentDuration');
    const futureValueDisplay = document.getElementById('futureValueDisplay');
    const yearlyInvestmentTotal = document.getElementById('yearlyInvestmentTotal');
    const yearlyInvestmentGain = document.getElementById('yearlyInvestmentGain');
    const totalContributionsDisplay = document.getElementById('totalContributions');
    const totalGainsDisplay = document.getElementById('totalGains');

    // Get values
    const startingAmount = parseFloat(startingAmountInput.value) || 0;
    const investmentType = investmentTypeSelect.value;
    const periodicAmount = parseFloat(investmentInput.value) || 0;
    const period = investmentPeriod.value;
    const duration = parseFloat(investmentDurationInput.value) || 0;

    // Calculate yearly investment
    const yearlyInvestment = calculateYearlyInvestment(periodicAmount, period);

    // Calculate gains for one year
    const gains = calculateInvestmentGains(startingAmount, periodicAmount, period, investmentType);

    // Calculate total: starting + yearly investment + all gains
    const total = startingAmount + yearlyInvestment + gains.totalGain;

    // Update yearly display
    yearlyInvestmentTotal.textContent = `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    yearlyInvestmentGain.textContent = `$${gains.totalGain.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Calculate and display future value
    if (duration > 0) {
        const futureData = calculateFutureValue(startingAmount, periodicAmount, period, investmentType, duration);
        futureValueDisplay.textContent = `$${futureData.futureValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        totalContributionsDisplay.textContent = `$${futureData.totalContributions.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        totalGainsDisplay.textContent = `$${futureData.totalGains.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else {
        futureValueDisplay.textContent = '$0.00';
        totalContributionsDisplay.textContent = '$0.00';
        totalGainsDisplay.textContent = '$0.00';
    }

    // Update query params
    updateAllQueryParams();
}

// Update Investment Calculator card display from future value change
function updateInvestmentCalculatorCardFromValue() {
    const startingAmountInput = document.getElementById('startingAmount');
    const investmentTypeSelect = document.getElementById('investmentType');
    const investmentInput = document.getElementById('investmentInput');
    const investmentPeriod = document.getElementById('investmentPeriod');
    const durationDisplay = document.getElementById('durationDisplay');
    const futureValueInput = document.getElementById('futureValueInput');
    const yearlyInvestmentTotal = document.getElementById('yearlyInvestmentTotal');
    const yearlyInvestmentGain = document.getElementById('yearlyInvestmentGain');
    const totalContributionsDisplay = document.getElementById('totalContributions');
    const totalGainsDisplay = document.getElementById('totalGains');

    // Get values
    const startingAmount = parseFloat(startingAmountInput.value) || 0;
    const investmentType = investmentTypeSelect.value;
    const periodicAmount = parseFloat(investmentInput.value) || 0;
    const period = investmentPeriod.value;
    const targetValue = parseFloat(futureValueInput.value) || 0;

    // Calculate yearly investment
    const yearlyInvestment = calculateYearlyInvestment(periodicAmount, period);

    // Calculate gains for one year
    const gains = calculateInvestmentGains(startingAmount, periodicAmount, period, investmentType);

    // Calculate total: starting + yearly investment + all gains
    const total = startingAmount + yearlyInvestment + gains.totalGain;

    // Update yearly display
    yearlyInvestmentTotal.textContent = `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    yearlyInvestmentGain.textContent = `$${gains.totalGain.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Calculate required duration and display results
    if (targetValue > 0) {
        const requiredDuration = calculateRequiredDuration(startingAmount, periodicAmount, period, investmentType, targetValue);
        durationDisplay.textContent = requiredDuration.toFixed(2);

        const futureData = calculateFutureValue(startingAmount, periodicAmount, period, investmentType, requiredDuration);
        totalContributionsDisplay.textContent = `$${futureData.totalContributions.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        totalGainsDisplay.textContent = `$${futureData.totalGains.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else {
        durationDisplay.textContent = '0';
        totalContributionsDisplay.textContent = '$0.00';
        totalGainsDisplay.textContent = '$0.00';
    }

    // Update query params
    updateAllQueryParams();
}

// Update from other fields (starting amount, type, periodic amount, period)
function updateInvestmentCalculatorCard() {
    // When other fields change, recalculate based on current input mode
    if (inputMode === 'value') {
        updateInvestmentCalculatorCardFromValue();
    } else {
        updateInvestmentCalculatorCardFromDuration();
    }
}

// Toggle between duration input and value input modes
function toggleCalculatorMode() {
    const futureValueInput = document.getElementById('futureValueInput');
    const futureValueDisplay = document.getElementById('futureValueDisplay');
    const durationInput = document.getElementById('investmentDuration');
    const durationDisplay = document.getElementById('durationDisplay');
    const toggleButton = document.getElementById('calculatorToggle');
    const toggleCircle = document.getElementById('toggleCircle');
    const toggleLabelLeft = document.getElementById('toggleLabelLeft');
    const toggleLabelRight = document.getElementById('toggleLabelRight');

    if (inputMode === 'duration') {
        // Switch to value input mode
        inputMode = 'value';

        // Show value input, hide value display
        futureValueInput.classList.remove('hidden');
        futureValueDisplay.classList.add('hidden');

        // Hide duration input, show duration display
        durationInput.classList.add('hidden');
        durationDisplay.classList.remove('hidden');

        // Update toggle appearance
        toggleButton.classList.add('bg-blue-500');
        toggleButton.classList.remove('bg-gray-600');
        toggleCircle.classList.add('translate-x-7');
        toggleCircle.classList.remove('translate-x-1');
        toggleLabelLeft.classList.add('text-gray-500');
        toggleLabelLeft.classList.remove('text-gray-400');
        toggleLabelRight.classList.remove('text-gray-500');
        toggleLabelRight.classList.add('text-blue-400');

        // Transfer value from display to input if available
        const displayValue = futureValueDisplay.textContent.replace(/[$,]/g, '');
        if (displayValue && displayValue !== '0.00') {
            futureValueInput.value = Math.round(parseFloat(displayValue));
        }

        updateInvestmentCalculatorCardFromValue();
    } else {
        // Switch to duration input mode
        inputMode = 'duration';

        // Hide value input, show value display
        futureValueInput.classList.add('hidden');
        futureValueDisplay.classList.remove('hidden');

        // Show duration input, hide duration display
        durationInput.classList.remove('hidden');
        durationDisplay.classList.add('hidden');

        // Update toggle appearance
        toggleButton.classList.remove('bg-blue-500');
        toggleButton.classList.add('bg-gray-600');
        toggleCircle.classList.remove('translate-x-7');
        toggleCircle.classList.add('translate-x-1');
        toggleLabelLeft.classList.remove('text-gray-500');
        toggleLabelLeft.classList.add('text-gray-400');
        toggleLabelRight.classList.add('text-gray-500');
        toggleLabelRight.classList.remove('text-blue-400');

        // Transfer value from display to input if available
        const displayValue = durationDisplay.textContent;
        if (displayValue && displayValue !== '0') {
            durationInput.value = parseFloat(displayValue);
        }

        updateInvestmentCalculatorCardFromDuration();
    }
}

// Initialize Investment Calculator card (right side card)
function initInvestmentCalculatorCard() {
    const startingAmountInput = document.getElementById('startingAmount');
    const investmentTypeSelect = document.getElementById('investmentType');
    const investmentDurationInput = document.getElementById('investmentDuration');
    const futureValueInput = document.getElementById('futureValueInput');
    const toggleButton = document.getElementById('calculatorToggle');

    if (!startingAmountInput || !investmentTypeSelect || !investmentDurationInput || !futureValueInput || !toggleButton) {
        console.error('Investment Calculator card elements not found');
        return;
    }

    // Load from query params
    const params = getQueryParams();
    if (params.startingAmount) {
        startingAmountInput.value = params.startingAmount;
    }
    if (params.investmentDuration) {
        investmentDurationInput.value = params.investmentDuration;
    }
    // Always set investmentType (even if it's just the default)
    investmentTypeSelect.value = params.investmentType;

    // Attach event listeners - separate handlers for duration and future value
    startingAmountInput.addEventListener('input', updateInvestmentCalculatorCard);
    investmentTypeSelect.addEventListener('change', updateInvestmentCalculatorCard);
    investmentDurationInput.addEventListener('input', updateInvestmentCalculatorCardFromDuration);
    futureValueInput.addEventListener('input', updateInvestmentCalculatorCardFromValue);
    toggleButton.addEventListener('click', toggleCalculatorMode);

    // Initial calculation (default to duration mode)
    updateInvestmentCalculatorCard();
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
        initInvestmentCalculatorCard();

        // Initialization complete - now allow query param updates
        isInitializing = false;

        setInterval(loadMarketData, REFRESH_INTERVAL);
    } catch (error) {
        console.error('Error initializing app:', error);
    }
}

// Start
init();
