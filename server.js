const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const https = require('https');

// Directory paths
const dataDir = path.join(__dirname, 'data');
const usersFile = path.join(dataDir, 'users.json');
const expensesFile = path.join(dataDir, 'expenses.json');
const goalsFile = path.join(dataDir, 'goals.json');
const frontendDir = path.join(__dirname, 'frontend');

// Secret used to sign tokens. In a real application this should be an environment
// variable and kept private. Here it's hard‑coded for simplicity.
const SECRET = 'change_this_secret_in_production';

/**
 * Read JSON data from a file. If the file does not exist or is invalid, an
 * empty array is returned. This helper ensures we always work with an array.
 * @param {string} filePath
 * @returns {Promise<array>}
 */
function readJson(filePath) {
  return new Promise((resolve) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        return resolve([]);
      }
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          resolve(parsed);
        } else {
          resolve([]);
        }
      } catch (e) {
        resolve([]);
      }
    });
  });
}

/**
 * Write an array of objects to a JSON file. This helper stringifies the
 * provided data with indentation for readability.
 * @param {string} filePath
 * @param {array} data
 * @returns {Promise<void>}
 */
function writeJson(filePath, data) {
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8', (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * Hash a password with a salt using SHA‑256. This is not as secure as bcrypt
 * but avoids external dependencies. The salt should be unique per user.
 * @param {string} password
 * @param {string} salt
 * @returns {string}
 */
function hashPassword(password, salt) {
  return crypto
    .createHash('sha256')
    .update(password + salt)
    .digest('hex');
}

/**
 * Generate a signed token for a user. The token consists of the payload
 * encoded in base64 followed by a signature. The signature is a SHA‑256
 * hash of the payload plus a secret. An expiry timestamp is included to
 * allow tokens to expire.
 * @param {number} userId
 * @returns {string}
 */
function generateToken(userId) {
  const payload = {
    userId,
    exp: Date.now() + 24 * 60 * 60 * 1000, // 24 hours expiry
  };
  const payloadString = JSON.stringify(payload);
  const base64Payload = Buffer.from(payloadString).toString('base64');
  const signature = crypto
    .createHash('sha256')
    .update(base64Payload + SECRET)
    .digest('hex');
  return `${base64Payload}.${signature}`;
}

/**
 * Verify a token and return the payload if valid. If the token is invalid or
 * expired, null is returned. Signature verification ensures the token has
 * not been tampered with.
 * @param {string} token
 * @returns {object|null}
 */
function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [base64Payload, signature] = parts;
  const expectedSig = crypto
    .createHash('sha256')
    .update(base64Payload + SECRET)
    .digest('hex');
  if (signature !== expectedSig) return null;
  try {
    const payloadString = Buffer.from(base64Payload, 'base64').toString('utf8');
    const payload = JSON.parse(payloadString);
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

/**
 * Serve static files. Looks up the requested path in the frontend directory.
 * If the file doesn't exist, responds with a 404. MIME types are handled for
 * basic file extensions.
 * @param {string} filePath
 * @param {http.ServerResponse} res
 */
function serveStatic(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
}

/**
 * Parse JSON body from a request. Returns a promise that resolves with the
 * parsed body or an empty object on error. Only called for API routes.
 * @param {http.IncomingMessage} req
 * @returns {Promise<object>}
 */
function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        resolve(parsed);
      } catch (e) {
        resolve({});
      }
    });
  });
}

/**
 * Handle API requests. Contains logic for authentication, user management and
 * expenses CRUD operations. Non‑API requests are ignored.
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @returns {Promise<boolean>} whether the request was handled
 */
async function handleApi(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const { pathname } = parsedUrl;
  // Only handle routes under /api
  if (!pathname.startsWith('/api')) return false;
  // CORS headers for API responses. Not strictly necessary since we're
  // serving frontend and API from same domain, but useful if hosting
  // separately.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }
  // Route: POST /api/register
  if (req.method === 'POST' && pathname === '/api/register') {
    const { username, password } = await parseBody(req);
    if (!username || !password) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Username and password are required' }));
      return true;
    }
    const users = await readJson(usersFile);
    // Check if username already exists
    if (users.some((u) => u.username === username)) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Username already exists' }));
      return true;
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const hashed = hashPassword(password, salt);
    const user = {
      id: users.length ? users[users.length - 1].id + 1 : 1,
      username,
      salt,
      hashed,
    };
    users.push(user);
    await writeJson(usersFile, users);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'User registered successfully' }));
    return true;
  }
  // Route: POST /api/login
  if (req.method === 'POST' && pathname === '/api/login') {
    const { username, password } = await parseBody(req);
    const users = await readJson(usersFile);
    const user = users.find((u) => u.username === username);
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid username or password' }));
      return true;
    }
    const hashed = hashPassword(password, user.salt);
    if (hashed !== user.hashed) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid username or password' }));
      return true;
    }
    const token = generateToken(user.id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ token }));
    return true;
  }
  // All routes below require authentication
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();
  const payload = verifyToken(token);
  if (!payload) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return true;
  }
  const userId = payload.userId;
  // Route: GET /api/expenses
  if (req.method === 'GET' && pathname === '/api/expenses') {
    const expenses = await readJson(expensesFile);
    const userExpenses = expenses.filter((e) => e.userId === userId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(userExpenses));
    return true;
  }
  // Route: POST /api/expenses
  if (req.method === 'POST' && pathname === '/api/expenses') {
    const { category, amount, date } = await parseBody(req);
    if (!category || !amount) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Category and amount are required' }));
      return true;
    }
    const expenses = await readJson(expensesFile);
    const expense = {
      id: expenses.length ? expenses[expenses.length - 1].id + 1 : 1,
      userId,
      category,
      amount: Number(amount),
      date: date || new Date().toISOString(),
    };
    expenses.push(expense);
    await writeJson(expensesFile, expenses);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(expense));
    return true;
  }
  // Route: PUT /api/expenses/:id
  if (req.method === 'PUT' && pathname.startsWith('/api/expenses/')) {
    const id = parseInt(pathname.split('/').pop(), 10);
    const updates = await parseBody(req);
    const expenses = await readJson(expensesFile);
    const index = expenses.findIndex((e) => e.id === id && e.userId === userId);
    if (index === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Expense not found' }));
      return true;
    }
    expenses[index] = { ...expenses[index], ...updates };
    await writeJson(expensesFile, expenses);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(expenses[index]));
    return true;
  }
  // Route: DELETE /api/expenses/:id
  if (req.method === 'DELETE' && pathname.startsWith('/api/expenses/')) {
    const id = parseInt(pathname.split('/').pop(), 10);
    const expenses = await readJson(expensesFile);
    const index = expenses.findIndex((e) => e.id === id && e.userId === userId);
    if (index === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Expense not found' }));
      return true;
    }
    const removed = expenses.splice(index, 1)[0];
    await writeJson(expensesFile, expenses);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(removed));
    return true;
  }
  // Route: GET /api/summary
  if (req.method === 'GET' && pathname === '/api/summary') {
    const expenses = await readJson(expensesFile);
    const userExpenses = expenses.filter((e) => e.userId === userId);
    const summary = {};
    for (const e of userExpenses) {
      summary[e.category] = (summary[e.category] || 0) + e.amount;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(summary));
    return true;
  }

  // Route: GET /api/advice
  // Provides simple rule‑based suggestions on how to cut costs and invest
  // savings. This is educational information, not professional financial advice.
  if (req.method === 'GET' && pathname === '/api/advice') {
    const expenses = await readJson(expensesFile);
    const userExpenses = expenses.filter((e) => e.userId === userId);
    const total = userExpenses.reduce((sum, e) => sum + e.amount, 0);
    const summary = {};
    for (const e of userExpenses) {
      summary[e.category] = (summary[e.category] || 0) + e.amount;
    }
    const suggestions = [];
    if (total > 0) {
      // Identify categories that exceed 30% of spending and suggest cutting back
      Object.keys(summary).forEach((cat) => {
        const pct = summary[cat] / total;
        if (pct > 0.3) {
          const percentage = Math.round(pct * 100);
          suggestions.push(
            `Your spending on ${cat} accounts for about ${percentage}% of your total expenses. Consider ways to reduce this category to free up money for savings.`
          );
        }
      });
    }
    // General budgeting advice referencing the 50/30/20 guideline
    suggestions.push(
      'Aim to follow a budgeting rule like the 50/30/20 rule: allocate around 50% of your income to necessities (rent, utilities, groceries), 30% to wants, and at least 20% to savings.'
    );
    // General saving and investing guidance (non‑specific)
    suggestions.push(
      'Build an emergency fund covering 3–6 months of expenses and focus on paying down high‑interest debt before investing. Then consider putting savings into broad vehicles such as high‑yield savings accounts, certificates of deposit, or diversified index funds. Always consult a professional for personalized advice.'
    );
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        total,
        summary,
        suggestions,
      })
    );
    return true;
  }

  // Route: POST /api/ai-advice
  // Calls an external AI service (OpenAI) to generate financial guidance. Requires
  // an OPENAI_API_KEY environment variable. Falls back to simple advice if not
  // configured. Accepts optional "prompt" in request body for additional context.
  if (req.method === 'POST' && pathname === '/api/ai-advice') {
    // Summarize user expenses
    const expenses = await readJson(expensesFile);
    const userExpenses = expenses.filter((e) => e.userId === userId);
    const summary = {};
    let totalSpent = 0;
    userExpenses.forEach((e) => {
      summary[e.category] = (summary[e.category] || 0) + e.amount;
      totalSpent += e.amount;
    });
    const summaryLines = Object.keys(summary)
      .map((cat) => `${cat}: ₦${summary[cat].toFixed(2)}`)
      .join(', ');
    let body = {};
    try {
      body = await parseBody(req);
    } catch (_) {}
    const apiKey = process.env.OPENAI_API_KEY;
    const basePrompt =
      `User spending summary: ${summaryLines} with total ₦${totalSpent.toFixed(
        2
      )}. Provide general budgeting and saving suggestions based on this summary following the 50-30-20 budgeting rule. Recommend ways to reduce costs and outline general types of investment vehicles (e.g., high-yield savings accounts, index funds, retirement accounts) without mentioning specific financial products. Include a disclaimer that it is educational information, not personal financial advice.`;
    const userPrompt = body.prompt ? `${basePrompt}\n\n${body.prompt}` : basePrompt;
    // Fallback if API key not provided
    if (!apiKey) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          suggestions: [
            'AI integration not configured. Please set an OPENAI_API_KEY environment variable to enable external advice.',
          ],
        })
      );
      return true;
    }
    const requestData = JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful assistant providing general budgeting and saving guidance. Do not provide personalized financial advice or recommend specific financial products.',
        },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 200,
      temperature: 0.7,
    });
    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    };
    const aiReq = https.request(options, (aiRes) => {
      let data = '';
      aiRes.on('data', (chunk) => {
        data += chunk;
      });
      aiRes.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const message =
            parsed.choices &&
            parsed.choices[0] &&
            parsed.choices[0].message &&
            parsed.choices[0].message.content;
          const adviceText = message ? message.trim() : '';
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ suggestions: [adviceText] }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to parse AI response' }));
        }
      });
    });
    aiReq.on('error', (err) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ error: 'External AI request failed', details: err.message })
      );
    });
    aiReq.write(requestData);
    aiReq.end();
    return true;
  }

  // Route: GET /api/goals
  if (req.method === 'GET' && pathname === '/api/goals') {
    const goals = await readJson(goalsFile);
    const userGoals = goals.filter((g) => g.userId === userId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(userGoals));
    return true;
  }
  // Route: POST /api/goals
  if (req.method === 'POST' && pathname === '/api/goals') {
    const { title, target, frequency } = await parseBody(req);
    if (!title || !target) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Title and target are required' }));
      return true;
    }
    const goals = await readJson(goalsFile);
    const goal = {
      id: goals.length ? goals[goals.length - 1].id + 1 : 1,
      userId,
      title,
      target: Number(target),
      frequency: frequency || 'monthly',
    };
    goals.push(goal);
    await writeJson(goalsFile, goals);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(goal));
    return true;
  }
  // Route: PUT /api/goals/:id
  if (req.method === 'PUT' && pathname.startsWith('/api/goals/')) {
    const id = parseInt(pathname.split('/').pop(), 10);
    const updates = await parseBody(req);
    const goals = await readJson(goalsFile);
    const index = goals.findIndex((g) => g.id === id && g.userId === userId);
    if (index === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Goal not found' }));
      return true;
    }
    goals[index] = { ...goals[index], ...updates };
    await writeJson(goalsFile, goals);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(goals[index]));
    return true;
  }
  // Route: DELETE /api/goals/:id
  if (req.method === 'DELETE' && pathname.startsWith('/api/goals/')) {
    const id = parseInt(pathname.split('/').pop(), 10);
    const goals = await readJson(goalsFile);
    const index = goals.findIndex((g) => g.id === id && g.userId === userId);
    if (index === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Goal not found' }));
      return true;
    }
    const removed = goals.splice(index, 1)[0];
    await writeJson(goalsFile, goals);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(removed));
    return true;
  }

  // Route: GET /api/profile
  if (req.method === 'GET' && pathname === '/api/profile') {
    const users = await readJson(usersFile);
    const user = users.find((u) => u.id === userId);
    if (!user) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'User not found' }));
      return true;
    }
    // Exclude sensitive fields
    const { username, fullName = '', email = '' } = user;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ username, fullName, email }));
    return true;
  }
  // Route: PUT /api/profile
  if (req.method === 'PUT' && pathname === '/api/profile') {
    const { fullName, email, password } = await parseBody(req);
    const users = await readJson(usersFile);
    const index = users.findIndex((u) => u.id === userId);
    if (index === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'User not found' }));
      return true;
    }
    // Update fields if provided
    if (typeof fullName === 'string') users[index].fullName = fullName;
    if (typeof email === 'string') users[index].email = email;
    if (typeof password === 'string' && password.trim()) {
      const newSalt = crypto.randomBytes(16).toString('hex');
      const newHashed = hashPassword(password.trim(), newSalt);
      users[index].salt = newSalt;
      users[index].hashed = newHashed;
    }
    await writeJson(usersFile, users);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Profile updated' }));
    return true;
  }
  // If we reach here, API route not found
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'API route not found' }));
  return true;
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  // First try to handle API routes
  const handled = await handleApi(req, res);
  if (handled) return;
  // If not an API request, serve static files
  let filePath = req.url;
  if (filePath === '/' || filePath === '') {
    filePath = '/login.html';
  }
  // Prevent directory traversal
  const resolvedPath = path.normalize(path.join(frontendDir, filePath));
  if (!resolvedPath.startsWith(frontendDir)) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad request');
    return;
  }
  fs.stat(resolvedPath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA routes
      serveStatic(path.join(frontendDir, 'index.html'), res);
    } else {
      serveStatic(resolvedPath, res);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});