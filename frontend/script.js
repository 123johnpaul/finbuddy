// Frontend logic for Fintech Buddy
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  // Normalize to file name only
  const page = path.split('/').pop() || 'login.html';
  if (page === 'login.html' || page === '') {
    initLoginPage();
  } else if (page === 'register.html') {
    initRegisterPage();
  } else if (page === 'index.html') {
    initDashboardPage();
  } else if (page === 'insights.html') {
    initInsightsPage();
  } else if (page === 'goals.html') {
    initGoalsPage();
  } else if (page === 'profile.html') {
    initProfilePage();
  } else {
    // fallback to dashboard for unknown pages
    initDashboardPage();
  }
});

/**
 * Utility to ensure a user is authenticated. If no token exists, redirects to
 * login page and returns null. Otherwise returns the token. Used by pages
 * requiring authentication.
 */
function requireAuth() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = 'login.html';
    return null;
  }
  return token;
}

/**
 * Initialize login page logic. Handles login form submission and error
 * messaging. On successful login, saves token and username to localStorage.
 */
function initLoginPage() {
  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      // Store token and username
      localStorage.setItem('token', data.token);
      localStorage.setItem('username', username);
      // Redirect to dashboard
      window.location.href = 'index.html';
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

/**
 * Initialize registration page logic. Handles register form submission and
 * displays messages on success or failure.
 */
function initRegisterPage() {
  const form = document.getElementById('registerForm');
  const errorEl = document.getElementById('registerError');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    const username = document.getElementById('registerUsername').value.trim();
    const password = document.getElementById('registerPassword').value.trim();
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      // After successful registration, redirect to login
      alert('Registration successful! You can now login.');
      window.location.href = 'login.html';
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

/**
 * Initialize dashboard page logic. Loads summary and expenses data, handles
 * adding and deleting expenses, and updates UI elements accordingly.
 */
function initDashboardPage() {
  const token = localStorage.getItem('token');
  if (!token) {
    // If no token, redirect to login
    window.location.href = 'login.html';
    return;
  }
  setActiveNav('index.html');
  // Set greeting
  const username = localStorage.getItem('username') || 'user';
  const greetingEl = document.getElementById('greeting');
  if (greetingEl) {
    greetingEl.textContent = `Hi, ${username}!`;
  }
  // Logout button
  const logoutBtn = document.getElementById('logoutButton');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      window.location.href = 'login.html';
    });
  }
  // Load summary and expenses
  fetchSummary();
  fetchExpenses();
  // Handle add expense form
  const expenseForm = document.getElementById('expenseForm');
  expenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const category = document.getElementById('expenseCategory').value.trim();
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    if (!category || isNaN(amount) || amount <= 0) return;
    try {
      await fetch('/api/expenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ category, amount }),
      });
      // Clear form
      document.getElementById('expenseCategory').value = '';
      document.getElementById('expenseAmount').value = '';
      // Refresh data
      fetchSummary();
      fetchExpenses();
    } catch (err) {
      console.error(err);
    }
  });
}

/**
 * Fetch expenses summary from the API and render the donut chart and list.
 */
async function fetchSummary() {
  const token = localStorage.getItem('token');
  try {
    const res = await fetch('/api/summary', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch summary');
    renderSummary(data);
  } catch (err) {
    console.error(err);
  }
}

/**
 * Render the summary donut chart and list using the provided data object.
 * @param {object} summary
 */
function renderSummary(summary) {
  const donutEl = document.getElementById('donutChart');
  const listEl = document.getElementById('summaryList');
  listEl.innerHTML = '';
  const categories = Object.keys(summary);
  const total = categories.reduce((sum, key) => sum + summary[key], 0);
  // If no expenses, set default grey chart
  if (!categories.length || total === 0) {
    donutEl.style.background = 'conic-gradient(var(--muted-text) 100%, var(--muted-text) 0)';
    return;
  }
  // Define colors for categories. Additional categories will cycle through a palette.
  const palette = [
    'var(--accent-color)',
    'var(--accent-color-secondary)',
    '#34d399', // teal
    '#fbbf24', // amber
    '#f472b6', // pink
    '#60a5fa', // blue
  ];
  const gradientParts = [];
  let accumulated = 0;
  categories.forEach((cat, index) => {
    const value = summary[cat];
    const percentage = (value / total) * 100;
    const start = accumulated;
    const end = accumulated + percentage;
    const color = palette[index % palette.length];
    gradientParts.push(`${color} ${start}% ${end}%`);
    accumulated += percentage;
    // List item
    const li = document.createElement('li');
    const colorBox = document.createElement('span');
    colorBox.className = 'color-box';
    colorBox.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue(color.replace('var(', '').replace(')', '')) || color;
    li.appendChild(colorBox);
    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${cat}`;
    li.appendChild(nameSpan);
    const amountSpan = document.createElement('span');
    amountSpan.textContent = `₦${value.toFixed(2)}`;
    li.appendChild(amountSpan);
    listEl.appendChild(li);
  });
  donutEl.style.background = `conic-gradient(${gradientParts.join(', ')})`;
  // Update list summary card with bars
  renderListSummary(summary);
}

/**
 * Fetch expenses from the API and render them in the list.
 */
async function fetchExpenses() {
  const token = localStorage.getItem('token');
  try {
    const res = await fetch('/api/expenses', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch expenses');
    renderExpenses(data);
    // Update predictive line chart based on expenses
    renderLineChart(data);
  } catch (err) {
    console.error(err);
  }
}

/**
 * Render the list of expenses with delete buttons.
 * @param {array} expenses
 */
function renderExpenses(expenses) {
  const listEl = document.getElementById('expenseList');
  listEl.innerHTML = '';
  if (!expenses.length) {
    const empty = document.createElement('li');
    empty.textContent = 'No expenses yet';
    empty.style.color = 'var(--muted-text)';
    listEl.appendChild(empty);
    return;
  }
  expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
  expenses.forEach((expense) => {
    const li = document.createElement('li');
    li.className = 'expense-item';
    const info = document.createElement('span');
    info.textContent = `${expense.category} – ₦${expense.amount.toFixed(2)}`;
    li.appendChild(info);
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => deleteExpense(expense.id));
    li.appendChild(delBtn);
    listEl.appendChild(li);
  });
}

/**
 * Delete an expense by ID and refresh data.
 * @param {number} id
 */
async function deleteExpense(id) {
  const token = localStorage.getItem('token');
  try {
    await fetch(`/api/expenses/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    fetchSummary();
    fetchExpenses();
  } catch (err) {
    console.error(err);
  }
}

/**
 * Render the list summary bars on the right column. Shows each category with a
 * colored bar and percentage of total spending. This uses the same summary
 * object as the donut chart but displays it in a compact list format.
 * @param {object} summary
 */
function renderListSummary(summary) {
  const container = document.getElementById('listSummary');
  if (!container) return;
  container.innerHTML = '';
  const categories = Object.keys(summary);
  const total = categories.reduce((sum, key) => sum + summary[key], 0);
  if (!categories.length || total === 0) {
    const empty = document.createElement('div');
    empty.textContent = 'No data';
    empty.style.color = 'var(--muted-text)';
    container.appendChild(empty);
    return;
  }
  const palette = [
    'var(--accent-color)',
    'var(--accent-color-secondary)',
    '#34d399',
    '#fbbf24',
    '#f472b6',
    '#60a5fa',
  ];
  categories.forEach((cat, index) => {
    const value = summary[cat];
    const percentage = (value / total) * 100;
    const item = document.createElement('div');
    item.className = 'list-summary-item';
    const left = document.createElement('span');
    left.textContent = cat;
    left.style.flex = '1';
    left.style.fontSize = '0.85rem';
    left.style.color = 'rgba(255,255,255,0.7)';
    const percentSpan = document.createElement('span');
    percentSpan.textContent = `${percentage.toFixed(0)}%`;
    percentSpan.style.fontSize = '0.85rem';
    percentSpan.style.color = 'rgba(255,255,255,0.6)';
    item.appendChild(left);
    item.appendChild(percentSpan);
    const barContainer = document.createElement('div');
    barContainer.style.height = '6px';
    barContainer.style.backgroundColor = 'rgba(255,255,255,0.1)';
    barContainer.style.borderRadius = '3px';
    barContainer.style.marginTop = '4px';
    const barFill = document.createElement('div');
    barFill.style.height = '6px';
    barFill.style.width = `${percentage}%`;
    const color = palette[index % palette.length];
    // Resolve CSS var if needed
    if (color.startsWith('var(')) {
      barFill.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue(color.replace('var(', '').replace(')', '')).trim();
    } else {
      barFill.style.backgroundColor = color;
    }
    barFill.style.borderRadius = '3px';
    barContainer.appendChild(barFill);
    item.appendChild(barContainer);
    container.appendChild(item);
  });
}

/**
 * Render a simple line chart inside the SVG element with id "lineChart".
 * Uses expense data to compute daily totals for the last 7 days. The chart
 * scales values relative to the maximum daily total and draws a polyline.
 * @param {array} expenses
 */
function renderLineChart(expenses) {
  const svg = document.getElementById('lineChart');
  if (!svg) return;
  // Compute spending per day over the last 7 days
  const today = new Date();
  const dailyTotals = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - i));
    const dayString = date.toISOString().split('T')[0];
    const total = expenses
      .filter((e) => e.date && e.date.startsWith(dayString))
      .reduce((sum, e) => sum + e.amount, 0);
    dailyTotals.push(total);
  }
  const maxVal = Math.max(...dailyTotals, 1);
  // Build polyline points
  const points = dailyTotals.map((val, idx) => {
    const x = (idx / 6) * 100;
    const y = 50 - (val / maxVal) * 40; // leave margin at top
    return `${x},${y}`;
  });
  // Clear existing contents
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('fill', 'none');
  const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#00eaff';
  polyline.setAttribute('stroke', accentColor);
  polyline.setAttribute('stroke-width', '2');
  polyline.setAttribute('points', points.join(' '));
  svg.appendChild(polyline);
  // Draw dots
  dailyTotals.forEach((val, idx) => {
    const cx = (idx / 6) * 100;
    const cy = 50 - (val / maxVal) * 40;
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', cx);
    circle.setAttribute('cy', cy);
    circle.setAttribute('r', '2');
    circle.setAttribute('fill', accentColor);
    svg.appendChild(circle);
  });
}

// -----------------------------------------------------------------------------
// Additional functionality for Insights, Goals and Profile pages
// -----------------------------------------------------------------------------

/**
 * Highlight the navigation item corresponding to the given page. This adds
 * the 'active' class to the matching link in both the sidebar and mobile
 * nav, and removes it from others. Pass the file name (e.g. 'index.html').
 * @param {string} pageFile
 */
function setActiveNav(pageFile) {
  const sidebarLinks = document.querySelectorAll('.sidebar .nav-item');
  sidebarLinks.forEach((link) => {
    const href = link.getAttribute('href') || '';
    if (href.endsWith(pageFile)) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
  const mobileLinks = document.querySelectorAll('.mobile-bottom-nav .nav-btn');
  mobileLinks.forEach((link) => {
    const href = link.getAttribute('href') || '';
    if (href.endsWith(pageFile)) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

/**
 * Initialize the insights page. Fetches expenses and builds category and
 * monthly spending charts. Displays a greeting if present and sets nav.
 */
function initInsightsPage() {
  const token = requireAuth();
  if (!token) return;
  setActiveNav('insights.html');
  // Set greeting if element exists
  const username = localStorage.getItem('username') || 'user';
  const greetingEl = document.getElementById('greeting');
  if (greetingEl) {
    greetingEl.textContent = `Hi, ${username}!`;
  }
  // Fetch expenses and compute insights
  fetch('/api/expenses', {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((res) => res.json())
    .then((expenses) => {
      renderInsights(expenses);
      // After rendering, fetch AI‑powered advice
      fetchAiAdvice();
    })
    .catch((err) => console.error(err));
}

/**
 * Compute and render category and monthly spending summaries for insights page.
 * @param {array} expenses
 */
function renderInsights(expenses) {
  // Compute total per category
  const summary = {};
  expenses.forEach((e) => {
    summary[e.category] = (summary[e.category] || 0) + e.amount;
  });
  renderInsightsSummary(summary);
  // Compute monthly totals for last 6 months
  const monthlyTotals = computeMonthlyTotals(expenses);
  renderMonthlyChart(monthlyTotals);
}

/**
 * Render the category summary on the insights page. Similar to renderSummary
 * but targets the insights summary elements (donut and list). Uses the
 * #insightsDonut and #insightsSummaryList IDs.
 * @param {object} summary
 */
function renderInsightsSummary(summary) {
  const donutEl = document.getElementById('insightsDonut');
  const listEl = document.getElementById('insightsSummaryList');
  if (!donutEl || !listEl) return;
  listEl.innerHTML = '';
  const categories = Object.keys(summary);
  const total = categories.reduce((sum, key) => sum + summary[key], 0);
  if (!categories.length || total === 0) {
    donutEl.style.background = 'conic-gradient(var(--muted-text) 100%, var(--muted-text) 0)';
    const empty = document.createElement('li');
    empty.textContent = 'No data';
    empty.style.color = 'var(--muted-text)';
    listEl.appendChild(empty);
    return;
  }
  const palette = [
    'var(--accent-color)',
    'var(--accent-color-secondary)',
    '#34d399',
    '#fbbf24',
    '#f472b6',
    '#60a5fa',
  ];
  const gradientParts = [];
  let accumulated = 0;
  categories.forEach((cat, index) => {
    const value = summary[cat];
    const percentage = (value / total) * 100;
    const start = accumulated;
    const end = accumulated + percentage;
    const color = palette[index % palette.length];
    gradientParts.push(`${color} ${start}% ${end}%`);
    accumulated += percentage;
    // list item
    const li = document.createElement('li');
    const colorBox = document.createElement('span');
    colorBox.className = 'color-box';
    if (color.startsWith('var(')) {
      colorBox.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue(color.replace('var(', '').replace(')', '')).trim();
    } else {
      colorBox.style.backgroundColor = color;
    }
    li.appendChild(colorBox);
    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${cat}`;
    li.appendChild(nameSpan);
    const amountSpan = document.createElement('span');
    amountSpan.textContent = `₦${value.toFixed(2)}`;
    li.appendChild(amountSpan);
    listEl.appendChild(li);
  });
  donutEl.style.background = `conic-gradient(${gradientParts.join(', ')})`;
}

/**
 * Compute monthly spending totals for the last 6 months. Returns an array of
 * objects with month labels and totals. Months are ordered oldest to newest.
 * @param {array} expenses
 * @returns {array<{label: string, total: number}>}
 */
function computeMonthlyTotals(expenses) {
  const today = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const label = date.toLocaleString(undefined, { month: 'short', year: 'numeric' });
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    const total = expenses
      .filter((e) => {
        const expDate = new Date(e.date);
        return expDate >= monthStart && expDate < monthEnd;
      })
      .reduce((sum, e) => sum + e.amount, 0);
    months.push({ label, total });
  }
  return months;
}

/**
 * Render a simple horizontal bar chart for monthly totals on the insights page.
 * Uses #monthlyChart element. Each bar is proportional to the maximum total.
 * @param {array<{label: string, total: number}>} monthlyTotals
 */
function renderMonthlyChart(monthlyTotals) {
  const container = document.getElementById('monthlyChart');
  if (!container) return;
  container.innerHTML = '';
  if (!monthlyTotals.length) {
    const div = document.createElement('div');
    div.textContent = 'No monthly data';
    div.style.color = 'var(--muted-text)';
    container.appendChild(div);
    return;
  }
  const maxTotal = Math.max(...monthlyTotals.map((m) => m.total), 1);
  monthlyTotals.forEach((m) => {
    const row = document.createElement('div');
    row.className = 'monthly-row';
    const labelSpan = document.createElement('span');
    labelSpan.textContent = m.label;
    labelSpan.style.flex = '1';
    labelSpan.style.fontSize = '0.85rem';
    labelSpan.style.color = 'rgba(255,255,255,0.7)';
    const valueSpan = document.createElement('span');
    valueSpan.textContent = `₦${m.total.toFixed(0)}`;
    valueSpan.style.fontSize = '0.85rem';
    valueSpan.style.color = 'rgba(255,255,255,0.6)';
    row.appendChild(labelSpan);
    row.appendChild(valueSpan);
    const barContainer = document.createElement('div');
    barContainer.style.height = '6px';
    barContainer.style.backgroundColor = 'rgba(255,255,255,0.1)';
    barContainer.style.borderRadius = '3px';
    barContainer.style.marginTop = '4px';
    const barFill = document.createElement('div');
    barFill.style.height = '6px';
    barFill.style.width = `${(m.total / maxTotal) * 100}%`;
    // Use accent color for bars
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#00eaff';
    barFill.style.backgroundColor = accent;
    barFill.style.borderRadius = '3px';
    barContainer.appendChild(barFill);
    row.appendChild(barContainer);
    container.appendChild(row);
  });
}

/**
 * Initialize the goals page. Handles goal CRUD operations and sets nav. A
 * form with id "goalForm" is used to create new goals, and a list with
 * id "goalList" displays existing goals.
 */
function initGoalsPage() {
  const token = requireAuth();
  if (!token) return;
  setActiveNav('goals.html');
  const username = localStorage.getItem('username') || 'user';
  const greetingEl = document.getElementById('greeting');
  if (greetingEl) {
    greetingEl.textContent = `Hi, ${username}!`;
  }
  // Fetch and render goals
  fetchGoals();
  // Handle add goal form
  const form = document.getElementById('goalForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('goalTitle').value.trim();
      const target = parseFloat(document.getElementById('goalTarget').value);
      const frequency = document.getElementById('goalFrequency').value;
      if (!title || isNaN(target) || target <= 0) return;
      try {
        await fetch('/api/goals', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ title, target, frequency }),
        });
        // Clear form
        document.getElementById('goalTitle').value = '';
        document.getElementById('goalTarget').value = '';
        document.getElementById('goalFrequency').value = 'monthly';
        // Refresh list
        fetchGoals();
      } catch (err) {
        console.error(err);
      }
    });
  }
}

/**
 * Fetch goals from the API and render them.
 */
async function fetchGoals() {
  const token = localStorage.getItem('token');
  try {
    const res = await fetch('/api/goals', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch goals');
    renderGoals(data);
  } catch (err) {
    console.error(err);
  }
}

/**
 * Render a list of goals with edit and delete buttons.
 * @param {array} goals
 */
function renderGoals(goals) {
  const listEl = document.getElementById('goalList');
  if (!listEl) return;
  listEl.innerHTML = '';
  if (!goals.length) {
    const li = document.createElement('li');
    li.textContent = 'No goals yet';
    li.style.color = 'var(--muted-text)';
    listEl.appendChild(li);
    return;
  }
  goals.sort((a, b) => a.id - b.id);
  goals.forEach((goal) => {
    const li = document.createElement('li');
    li.className = 'goal-item';
    const info = document.createElement('span');
    info.textContent = `${goal.title} – ₦${goal.target.toFixed(2)} (${goal.frequency})`;
    li.appendChild(info);
    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => {
      editGoal(goal);
    });
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => {
      deleteGoalItem(goal.id);
    });
    li.appendChild(editBtn);
    li.appendChild(delBtn);
    listEl.appendChild(li);
  });
}

/**
 * Show a simple prompt to edit a goal. Updates the goal if user provides
 * new values. This uses window.prompt for simplicity.
 * @param {object} goal
 */
function editGoal(goal) {
  const newTitle = prompt('Enter new title', goal.title);
  if (newTitle === null) return; // cancelled
  const newTargetStr = prompt('Enter new target amount', goal.target.toString());
  if (newTargetStr === null) return;
  const newTarget = parseFloat(newTargetStr);
  if (!newTitle.trim() || isNaN(newTarget) || newTarget <= 0) return;
  const newFrequency = prompt('Enter frequency (daily, weekly, monthly)', goal.frequency) || goal.frequency;
  const token = localStorage.getItem('token');
  fetch(`/api/goals/${goal.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ title: newTitle.trim(), target: newTarget, frequency: newFrequency.trim() }),
  })
    .then(() => fetchGoals())
    .catch((err) => console.error(err));
}

/**
 * Delete a goal by ID and refresh the list.
 * @param {number} id
 */
function deleteGoalItem(id) {
  const token = localStorage.getItem('token');
  fetch(`/api/goals/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(() => fetchGoals())
    .catch((err) => console.error(err));
}

/**
 * Initialize the profile page. Fetches user profile details and allows
 * updating full name, email and password. Uses form with id "profileForm".
 */
function initProfilePage() {
  const token = requireAuth();
  if (!token) return;
  setActiveNav('profile.html');
  // Fetch profile data
  fetch('/api/profile', {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.error) throw new Error(data.error);
      populateProfileForm(data);
    })
    .catch((err) => console.error(err));
  // Handle profile form submission
  const form = document.getElementById('profileForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fullName = document.getElementById('profileFullName').value.trim();
      const email = document.getElementById('profileEmail').value.trim();
      const password = document.getElementById('profilePassword').value;
      const payload = {};
      if (fullName) payload.fullName = fullName;
      if (email) payload.email = email;
      if (password) payload.password = password;
      fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })
        .then((res) => res.json())
        .then((resp) => {
          if (!resp || resp.error) throw new Error(resp.error || 'Update failed');
          alert('Profile updated successfully');
          // Clear password field
          const pwEl = document.getElementById('profilePassword');
          if (pwEl) pwEl.value = '';
        })
        .catch((err) => alert(err.message));
    });
  }
}

/**
 * Populate the profile form fields with fetched data. Expects an object
 * containing username, fullName and email. The username field is read-only.
 * @param {object} data
 */
function populateProfileForm(data) {
  const userEl = document.getElementById('profileUsername');
  const fullNameEl = document.getElementById('profileFullName');
  const emailEl = document.getElementById('profileEmail');
  if (userEl) userEl.value = data.username || '';
  if (fullNameEl) fullNameEl.value = data.fullName || '';
  if (emailEl) emailEl.value = data.email || '';
}

/**
 * Fetch simple AI advice from the server and render it. The advice is
 * generated using a rule‑based algorithm on the backend. It provides
 * high‑level budgeting and saving suggestions. Results are displayed in
 * the #adviceList element.
 */
function fetchAdvice() {
  const token = localStorage.getItem('token');
  if (!token) return;
  fetch('/api/advice', {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((res) => res.json())
    .then((data) => {
      if (data && data.suggestions) {
        renderAdvice(data.suggestions);
      }
    })
    .catch((err) => console.error(err));
}

/**
 * Render a list of advice strings inside the #adviceList container.
 * @param {array<string>} suggestions
 */
function renderAdvice(suggestions) {
  const container = document.getElementById('adviceList');
  if (!container) return;
  container.innerHTML = '';
  suggestions.forEach((text) => {
    const div = document.createElement('div');
    div.className = 'advice-item';
    div.textContent = text;
    container.appendChild(div);
  });
}

/**
 * Fetch AI‑powered advice from the server and render it. This endpoint
 * attempts to call an external AI service (e.g., OpenAI). If no API key
 * is configured on the server, the response will contain a fallback
 * message. Uses POST /api/ai-advice with an empty JSON body. Requires
 * an Authorization header with the user token.
 */
function fetchAiAdvice() {
  const token = localStorage.getItem('token');
  if (!token) return;
  fetch('/api/ai-advice', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data && data.suggestions) {
        renderAdvice(data.suggestions);
      }
    })
    .catch((err) => {
      console.error(err);
    });
}