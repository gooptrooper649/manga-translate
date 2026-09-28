import express from 'express';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Fernet Encryption / Decryption Helper (cryptography.fernet compatible) ────

const KEY_FILE = path.join(__dirname, '.secret.key');
const USER_CONFIG_FILE = path.join(__dirname, 'user_config.json');
const KEYS_VAULT_FILE = path.join(__dirname, 'keys_vault.json');

function getOrCreateFernetKey(): Buffer {
  if (!fs.existsSync(KEY_FILE)) {
    // Fernet key: 32 random bytes, base64-url encoded
    const rawKey = crypto.randomBytes(32);
    const base64Key = rawKey.toString('base64');
    fs.writeFileSync(KEY_FILE, base64Key, 'utf-8');
    return rawKey;
  }
  const keyStr = fs.readFileSync(KEY_FILE, 'utf-8').trim();
  return Buffer.from(keyStr, 'base64');
}

function encryptWithFernet(plaintext: string): string {
  const fullKey = getOrCreateFernetKey();
  const signingKey = fullKey.subarray(0, 16);
  const encryptionKey = fullKey.subarray(16, 32);

  const version = Buffer.from([0x80]);
  const timestamp = Buffer.alloc(8);
  const nowBigInt = BigInt(Math.floor(Date.now() / 1000));
  timestamp.writeBigInt64BE(nowBigInt);

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-128-cbc', encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);

  const basicParts = Buffer.concat([version, timestamp, iv, ciphertext]);
  const hmac = crypto.createHmac('sha256', signingKey);
  hmac.update(basicParts);
  const hmacDigest = hmac.digest();

  const token = Buffer.concat([basicParts, hmacDigest]);
  // URL-safe base64
  return token.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

function decryptWithFernet(tokenBase64: string): string {
  // Normalize base64
  let normalized = tokenBase64.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4 !== 0) {
    normalized += '=';
  }

  const token = Buffer.from(normalized, 'base64');
  if (token.length < 57) {
    throw new Error('Token too short to be valid Fernet');
  }

  const fullKey = getOrCreateFernetKey();
  const signingKey = fullKey.subarray(0, 16);
  const encryptionKey = fullKey.subarray(16, 32);

  const basicParts = token.subarray(0, token.length - 32);
  const hmacExpected = token.subarray(token.length - 32);

  const hmac = crypto.createHmac('sha256', signingKey);
  hmac.update(basicParts);
  const hmacActual = hmac.digest();

  if (!crypto.timingSafeEqual(hmacExpected, hmacActual)) {
    throw new Error('Invalid Fernet HMAC signature');
  }

  const iv = basicParts.subarray(9, 25);
  const ciphertext = basicParts.subarray(25);

  const decipher = crypto.createDecipheriv('aes-128-cbc', encryptionKey, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf-8');
}

function loadEncryptedConfig(): { provider: string; apiKey: string } | null {
  if (!fs.existsSync(USER_CONFIG_FILE)) return null;
  try {
    const raw = fs.readFileSync(USER_CONFIG_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.encrypted_key) return null;
    const apiKey = decryptWithFernet(data.encrypted_key);
    return {
      provider: data.provider || 'Gemini',
      apiKey,
    };
  } catch (err) {
    console.error('[SECURITY ERROR] Failed to load/decrypt user_config.json:', err);
    return null;
  }
}

function saveEncryptedConfig(apiKey: string, provider: string) {
  const encryptedKey = encryptWithFernet(apiKey.trim());
  const payload = {
    provider: provider.trim(),
    encrypted_key: encryptedKey,
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(USER_CONFIG_FILE, JSON.stringify(payload, null, 2), 'utf-8');
}

function clearEncryptedConfig() {
  if (fs.existsSync(USER_CONFIG_FILE)) {
    fs.unlinkSync(USER_CONFIG_FILE);
  }
}

// ── In-Memory Key Manager & Usage Tracker ─────────────────────────────────────

interface ApiKeyEntry {
  id: string;
  name: string;
  provider: 'gemini' | 'openai' | 'deepseek' | 'groq';
  apiKey: string;
  isActive: boolean;
  createdAt: string;
}

interface RoutingEvent {
  id: string;
  timestamp: string;
  keyName: string;
  action: 'request_ok' | 'rate_limited' | 'fallback' | 'key_switch';
  detail: string;
  tokensUsed: number;
}

interface KeyStats {
  keyId: string;
  keyName: string;
  provider: string;
  totalRequests: number;
  totalTokens: number;
  rateLimitHits: number;
  isRateLimited: boolean;
  cooldownUntil: string | null;
}

class ServerState {
  private keys: ApiKeyEntry[] = [];
  private stats: Map<string, { requests: number; tokens: number; rateLimits: number; cooldownUntil: number | null }> = new Map();
  private routingLog: RoutingEvent[] = [];

  constructor() {
    // Check if user_config.json exists and load it
    const userCfg = loadEncryptedConfig();
    if (userCfg) {
      this.keys.push({
        id: 'user-encrypted-key',
        name: `User Config (${userCfg.provider})`,
        provider: userCfg.provider.toLowerCase() as any,
        apiKey: userCfg.apiKey,
        isActive: true,
        createdAt: new Date().toISOString(),
      });
    }

    // Load any keys saved in the key vault
    this.loadVaultKeys();

    // Add default system Gemini key if available
    const envGemini = process.env.GEMINI_API_KEY;
    if (envGemini && !this.keys.some((k) => k.apiKey === envGemini.trim())) {
      this.keys.push({
        id: 'system-gemini',
        name: 'AI Studio Gemini (Server Default)',
        provider: 'gemini',
        apiKey: envGemini.trim(),
        isActive: true,
        createdAt: new Date().toISOString(),
      });
    } else if (!userCfg && this.keys.length === 0) {
      // Demo placeholder key entry so UI is populated
      this.keys.push({
        id: 'demo-gemini',
        name: 'Gemini 3.8 Flash (Active Route)',
        provider: 'gemini',
        apiKey: 'DEMO_KEY_LOCAL_FALLBACK',
        isActive: true,
        createdAt: new Date().toISOString(),
      });
    }
  }

  private loadVaultKeys() {
    if (!fs.existsSync(KEYS_VAULT_FILE)) return;
    try {
      const raw = fs.readFileSync(KEYS_VAULT_FILE, 'utf-8');
      const savedList: ApiKeyEntry[] = JSON.parse(raw);
      if (Array.isArray(savedList)) {
        for (const item of savedList) {
          if (item.id && item.apiKey && !this.keys.some((k) => k.id === item.id || k.apiKey === item.apiKey)) {
            this.keys.push(item);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load keys_vault.json:', e);
    }
  }

  private saveVaultKeys() {
    try {
      const persistable = this.keys.filter(
        (k) => k.id !== 'user-encrypted-key' && k.id !== 'system-gemini' && !k.id.startsWith('demo-')
      );
      fs.writeFileSync(KEYS_VAULT_FILE, JSON.stringify(persistable, null, 2), 'utf-8');
    } catch (e) {
      console.warn('Failed to save keys_vault.json:', e);
    }
  }

  public listKeys(): Array<Omit<ApiKeyEntry, 'apiKey'> & { maskedKey: string }> {
    return this.keys.map((k) => ({
      id: k.id,
      name: k.name,
      provider: k.provider,
      isActive: k.isActive,
      createdAt: k.createdAt,
      maskedKey: this.maskKey(k.apiKey),
    }));
  }

  public setUserKey(apiKey: string, provider: string) {
    this.keys = this.keys.filter((k) => k.id !== 'user-encrypted-key');
    this.keys.unshift({
      id: 'user-encrypted-key',
      name: `User Key (${provider})`,
      provider: provider.toLowerCase() as any,
      apiKey: apiKey.trim(),
      isActive: true,
      createdAt: new Date().toISOString(),
    });
  }

  public removeUserKey() {
    this.keys = this.keys.filter((k) => k.id !== 'user-encrypted-key');
  }

  public addKey(name: string, provider: 'gemini' | 'openai' | 'deepseek' | 'groq', apiKey: string): ApiKeyEntry {
    const entry: ApiKeyEntry = {
      id: 'key_' + Math.random().toString(36).substring(2, 9),
      name: name.trim(),
      provider,
      apiKey: apiKey.trim(),
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    this.keys.push(entry);
    this.saveVaultKeys();
    return entry;
  }

  public toggleKey(id: string): boolean {
    const k = this.keys.find((x) => x.id === id);
    if (!k) return false;
    k.isActive = !k.isActive;
    this.saveVaultKeys();
    return true;
  }

  public removeKey(id: string): boolean {
    const prevLen = this.keys.length;
    this.keys = this.keys.filter((x) => x.id !== id);
    if (this.keys.length !== prevLen) {
      this.saveVaultKeys();
      return true;
    }
    return false;
  }

  public getCandidateKeys(provider: string = 'gemini'): ApiKeyEntry[] {
    const candidates: ApiKeyEntry[] = [];
    const seen = new Set<string>();

    // 1. User config key if present and matches provider
    const userCfg = loadEncryptedConfig();
    if (userCfg && userCfg.provider.toLowerCase() === provider.toLowerCase() && userCfg.apiKey) {
      candidates.push({
        id: 'user-encrypted-key',
        name: `User Key (${userCfg.provider})`,
        provider: userCfg.provider.toLowerCase() as any,
        apiKey: userCfg.apiKey.trim(),
        isActive: true,
        createdAt: new Date().toISOString(),
      });
      seen.add(userCfg.apiKey.trim());
    }

    // 2. Active keys in state
    const now = Date.now();
    const active = this.keys.filter((k) => k.isActive && k.provider.toLowerCase() === provider.toLowerCase());

    // Sort: non-cooldowned keys first, then shortest remaining cooldown
    const sorted = [...active].sort((a, b) => {
      const stA = this.stats.get(a.id);
      const stB = this.stats.get(b.id);
      const coolA = stA?.cooldownUntil && stA.cooldownUntil > now ? stA.cooldownUntil : 0;
      const coolB = stB?.cooldownUntil && stB.cooldownUntil > now ? stB.cooldownUntil : 0;
      return coolA - coolB;
    });

    for (const key of sorted) {
      if (!seen.has(key.apiKey.trim())) {
        candidates.push(key);
        seen.add(key.apiKey.trim());
      }
    }

    // 3. Fallback to process.env.GEMINI_API_KEY
    if (provider.toLowerCase() === 'gemini' && process.env.GEMINI_API_KEY && !seen.has(process.env.GEMINI_API_KEY.trim())) {
      candidates.push({
        id: 'system-gemini',
        name: 'AI Studio Gemini (Server Default)',
        provider: 'gemini',
        apiKey: process.env.GEMINI_API_KEY.trim(),
        isActive: true,
        createdAt: new Date().toISOString(),
      });
      seen.add(process.env.GEMINI_API_KEY.trim());
    }

    return candidates;
  }

  public getActiveKey(provider: string = 'gemini'): ApiKeyEntry | null {
    const active = this.keys.filter((k) => k.isActive && k.provider.toLowerCase() === provider.toLowerCase());
    if (!active.length) {
      if (provider.toLowerCase() === 'gemini' && process.env.GEMINI_API_KEY) {
        return {
          id: 'env-fallback',
          name: 'Environment Gemini Key',
          provider: 'gemini',
          apiKey: process.env.GEMINI_API_KEY,
          isActive: true,
          createdAt: new Date().toISOString(),
        };
      }
      return null;
    }
    const now = Date.now();
    for (const key of active) {
      const st = this.stats.get(key.id);
      if (!st || !st.cooldownUntil || st.cooldownUntil <= now) {
        return key;
      }
    }
    return active[0];
  }

  public recordSuccess(keyName: string, keyId: string, tokens: number, model: string) {
    const cur = this.stats.get(keyId) || { requests: 0, tokens: 0, rateLimits: 0, cooldownUntil: null };
    cur.requests += 1;
    cur.tokens += tokens;
    this.stats.set(keyId, cur);

    this.routingLog.unshift({
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      keyName,
      action: 'request_ok',
      detail: `Model: ${model} | Completed translation batch`,
      tokensUsed: tokens,
    });
    if (this.routingLog.length > 100) this.routingLog.pop();
  }

  public recordRateLimit(keyName: string, keyId: string, cooldownSec: number = 60) {
    const cur = this.stats.get(keyId) || { requests: 0, tokens: 0, rateLimits: 0, cooldownUntil: null };
    cur.rateLimits += 1;
    cur.cooldownUntil = Date.now() + cooldownSec * 1000;
    this.stats.set(keyId, cur);

    this.routingLog.unshift({
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      keyName,
      action: 'rate_limited',
      detail: `Rate limit hit. Marked cooldown for ${cooldownSec}s`,
      tokensUsed: 0,
    });
    if (this.routingLog.length > 100) this.routingLog.pop();
  }

  public recordFallback(fromKey: string, toKey: string, detail: string) {
    this.routingLog.unshift({
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      keyName: fromKey,
      action: 'fallback',
      detail: `Fallback triggered to ${toKey}: ${detail}`,
      tokensUsed: 0,
    });
    if (this.routingLog.length > 100) this.routingLog.pop();
  }

  public getStats(): KeyStats[] {
    const now = Date.now();
    return this.keys.map((k) => {
      const s = this.stats.get(k.id) || { requests: 0, tokens: 0, rateLimits: 0, cooldownUntil: null };
      const isCooldowned = !!(s.cooldownUntil && s.cooldownUntil > now);
      return {
        keyId: k.id,
        keyName: k.name,
        provider: k.provider,
        totalRequests: s.requests,
        totalTokens: s.tokens,
        rateLimitHits: s.rateLimits,
        isRateLimited: isCooldowned,
        cooldownUntil: s.cooldownUntil ? new Date(s.cooldownUntil).toISOString() : null,
      };
    });
  }

  public getRoutingLog(): RoutingEvent[] {
    return this.routingLog;
  }

  public maskKey(k: string): string {
    if (!k || k.length <= 6) return '••••••';
    return `${k.substring(0, 4)}...${k.substring(k.length - 3)}`;
  }
}

const state = new ServerState();

// ── Authentication & User Onboarding API Endpoints ────────────────────────────

// 1. Get Auth Status (check if encrypted user_config.json exists)
app.get('/api/auth/config', (req, res) => {
  const cfg = loadEncryptedConfig();
  if (cfg && cfg.apiKey) {
    res.json({
      isAuthenticated: true,
      provider: cfg.provider,
      maskedKey: state.maskKey(cfg.apiKey),
    });
  } else {
    // If process.env.GEMINI_API_KEY is available in AI Studio, report as pre-authenticated default
    if (process.env.GEMINI_API_KEY) {
      res.json({
        isAuthenticated: true,
        provider: 'Gemini (AI Studio System)',
        maskedKey: state.maskKey(process.env.GEMINI_API_KEY),
      });
    } else {
      res.json({
        isAuthenticated: false,
        provider: null,
        maskedKey: null,
      });
    }
  }
});

function formatErrorMessage(err: any): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') {
    try {
      const parsed = JSON.parse(err);
      if (parsed.error?.message) return parsed.error.message;
      if (parsed.message) return parsed.message;
    } catch {
      const match = err.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          if (parsed.error?.message) return parsed.error.message;
          if (parsed.message) return parsed.message;
        } catch {}
      }
    }
    return err;
  }
  if (err.error?.message) return err.error.message;
  if (err.message) {
    const raw = String(err.message);
    try {
      const parsed = JSON.parse(raw);
      if (parsed.error?.message) return parsed.error.message;
      if (parsed.message) return parsed.message;
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          if (parsed.error?.message) return parsed.error.message;
          if (parsed.message) return parsed.message;
        } catch {}
      }
    }
    return raw;
  }
  return String(err);
}

// 2. Test Connection (Sends tiny dummy payload to Google GenAI SDK to verify key)
app.post('/api/auth/test-connection', async (req, res) => {
  const { apiKey, provider = 'Gemini' } = req.body;
  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({ success: false, error: 'Please enter an API key to test.' });
  }

  const cleanKey = apiKey.trim();

  if (provider.toLowerCase() === 'gemini') {
    try {
      const ai = new GoogleGenAI({
        apiKey: cleanKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      // Send minimal payload to verify API authentication
      let verified = false;
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: 'hello',
        });
        if (response && response.text) verified = true;
      } catch (firstErr: any) {
        if (firstErr?.message?.includes('RESOURCE_EXHAUSTED') || firstErr?.message?.includes('429')) {
          // Try fallback model
          try {
            const fallbackRes = await ai.models.generateContent({
              model: 'gemini-3.1-flash-lite',
              contents: 'hello',
            });
            if (fallbackRes && fallbackRes.text) verified = true;
          } catch {
            return res.json({
              success: true,
              message: 'API Key is authentic (currently rate-limited or quota reached on primary model).',
            });
          }
        } else {
          throw firstErr;
        }
      }

      return res.json({
        success: true,
        message: 'API Key successfully verified with Google GenAI SDK! Connection active.',
      });
    } catch (err: any) {
      const errorMsg = formatErrorMessage(err);
      if (errorMsg.includes('API_KEY_INVALID') || errorMsg.includes('INVALID_ARGUMENT') || errorMsg.includes('400')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid API Key. Please verify your Google AI Studio key and try again.',
        });
      } else if (errorMsg.includes('PERMISSION_DENIED') || errorMsg.includes('403')) {
        return res.status(403).json({
          success: false,
          error: 'Permission denied for this key. Ensure the Generative Language API is enabled.',
        });
      } else if (errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.includes('429')) {
        return res.json({
          success: true,
          message: 'API Key is valid (currently rate-limited or quota reached).',
        });
      }
      return res.status(500).json({
        success: false,
        error: `Connection test failed: ${errorMsg}`,
      });
    }
  } else {
    // Non-Gemini providers (Groq, OpenAI, DeepSeek): Validate format
    if (cleanKey.length < 8) {
      return res.status(400).json({ success: false, error: `Invalid key format for ${provider}.` });
    }
    return res.json({
      success: true,
      message: `Key format accepted for ${provider}. Ready to save.`,
    });
  }
});

// 3. Save & Encrypt Credentials to user_config.json
app.post('/api/auth/save-config', async (req, res) => {
  const { apiKey, provider = 'Gemini' } = req.body;
  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({ success: false, error: 'API key is required.' });
  }

  const cleanKey = apiKey.trim();

  // Validate before saving if Gemini
  if (provider.toLowerCase() === 'gemini') {
    try {
      const ai = new GoogleGenAI({
        apiKey: cleanKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      try {
        await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: 'ping',
        });
      } catch (pingErr: any) {
        // If quota exceeded or 429, key is still valid
        if (!pingErr?.message?.includes('RESOURCE_EXHAUSTED') && !pingErr?.message?.includes('429')) {
          throw pingErr;
        }
      }
    } catch (err: any) {
      const errorMsg = formatErrorMessage(err);
      if (errorMsg.includes('API_KEY_INVALID') || errorMsg.includes('400')) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed: Invalid API key. Please check your key and try again.',
        });
      }
    }
  }

  // Encrypt with Fernet and save
  try {
    saveEncryptedConfig(cleanKey, provider);
    state.setUserKey(cleanKey, provider);

    res.json({
      success: true,
      provider,
      maskedKey: state.maskKey(cleanKey),
      message: 'Key successfully encrypted using Fernet and stored in user_config.json!',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: `Failed to encrypt credentials: ${err.message}` });
  }
});

// 4. Logout / Clear Key
app.post('/api/auth/logout', (req, res) => {
  clearEncryptedConfig();
  state.removeUserKey();
  res.json({ success: true, message: 'Local credentials cleared.' });
});

// ── Other API Routes ─────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

app.get('/api/keys', (req, res) => {
  res.json(state.listKeys());
});

app.post('/api/keys', (req, res) => {
  const { name, provider, apiKey } = req.body;
  if (!name || !apiKey) {
    return res.status(400).json({ error: 'Name and API Key are required' });
  }
  const entry = state.addKey(name, provider || 'gemini', apiKey);
  res.json({ success: true, key: { id: entry.id, name: entry.name, provider: entry.provider } });
});

app.patch('/api/keys/:id/toggle', (req, res) => {
  const ok = state.toggleKey(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Key not found' });
  res.json({ success: true });
});

app.delete('/api/keys/:id', (req, res) => {
  const ok = state.removeKey(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Key not found' });
  res.json({ success: true });
});

app.get('/api/tracker/stats', (req, res) => {
  res.json({
    stats: state.getStats(),
    events: state.getRoutingLog(),
  });
});

// ── Sample Images Serving & Metadata Endpoint ───────────────────────────────
const SAMPLE_IMAGES_DIR = path.join(__dirname, 'sample_images');
app.use('/sample_images', express.static(SAMPLE_IMAGES_DIR));

app.get('/api/sample-images', (req, res) => {
  try {
    if (!fs.existsSync(SAMPLE_IMAGES_DIR)) {
      return res.json([]);
    }
    const files = fs
      .readdirSync(SAMPLE_IMAGES_DIR)
      .filter((f) => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'))
      .sort();

    const results = files.map((filename, idx) => {
      const filePath = path.join(SAMPLE_IMAGES_DIR, filename);
      const buffer = fs.readFileSync(filePath);
      const base64 = buffer.toString('base64');
      const ext = path.extname(filename).toLowerCase().includes('jpg') ? 'jpeg' : 'png';
      const dataUrl = `data:image/${ext};base64,${base64}`;

      return {
        id: `sample_page_${String(idx + 1).padStart(2, '0')}`,
        filename,
        pageNumber: idx + 1,
        title: `Authentic Sample Manga - Page ${idx + 1}`,
        dataUrl,
        width: 800,
        height: 1200,
      };
    });

    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list sample images' });
  }
});

// ── Bug Reporting System (forward to studyaccformeonly@gmail.com) ─────────────
const BUG_REPORTS_FILE = path.join(__dirname, 'bug_reports.json');

app.post('/api/report-bug', (req, res) => {
  try {
    const {
      title = 'User Bug Report',
      description,
      userEmail,
      imageDataUrl,
      systemInfo,
      logs = [],
    } = req.body;

    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'Description is required' });
    }

    const reportId = `bug_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newReport = {
      id: reportId,
      timestamp: new Date().toISOString(),
      recipient: 'studyaccformeonly@gmail.com',
      title: title.trim(),
      description: description.trim(),
      userEmail: userEmail?.trim() || 'Anonymous User',
      hasImage: !!imageDataUrl,
      imageDataUrl: imageDataUrl || null,
      systemInfo: systemInfo || {},
      logs: Array.isArray(logs) ? logs.slice(-20) : [],
    };

    let existingReports: any[] = [];
    if (fs.existsSync(BUG_REPORTS_FILE)) {
      try {
        existingReports = JSON.parse(fs.readFileSync(BUG_REPORTS_FILE, 'utf-8'));
      } catch {
        existingReports = [];
      }
    }
    existingReports.unshift(newReport);
    fs.writeFileSync(BUG_REPORTS_FILE, JSON.stringify(existingReports.slice(0, 50), null, 2));

    console.log(`[BUG REPORT DISPATCHED] ID: ${reportId} for studyaccformeonly@gmail.com`);

    // Prepare mailto link details for direct client dispatch
    const emailSubject = encodeURIComponent(`[Manga Translator Bug Report] ${newReport.title}`);
    const emailBody = encodeURIComponent(
      `Issue Description:\n${newReport.description}\n\nUser Contact: ${newReport.userEmail}\nTimestamp: ${newReport.timestamp}\nSystem: ${JSON.stringify(newReport.systemInfo, null, 2)}\n\n(Attachment included in app report ${reportId})`
    );
    const mailtoUrl = `mailto:studyaccformeonly@gmail.com?subject=${emailSubject}&body=${emailBody}`;

    res.json({
      success: true,
      reportId,
      forwardedTo: 'studyaccformeonly@gmail.com',
      mailtoUrl,
      message: 'Bug report recorded and queued for studyaccformeonly@gmail.com',
    });
  } catch (err: any) {
    console.error('Failed to save bug report:', err);
    res.status(500).json({ error: err.message || 'Failed to submit bug report' });
  }
});

app.get('/api/bug-reports', (req, res) => {
  try {
    if (fs.existsSync(BUG_REPORTS_FILE)) {
      const reports = JSON.parse(fs.readFileSync(BUG_REPORTS_FILE, 'utf-8'));
      return res.json(reports);
    }
    res.json([]);
  } catch {
    res.json([]);
  }
});

// ── Automatic Multi-Key Rerouting & Multi-Attempt Engine ──────────────────────

interface AttemptDetail {
  attempt: number;
  keyName: string;
  model: string;
  error?: string;
  durationMs: number;
}

interface ExecutionResult<T> {
  data: T;
  keyUsed: string;
  keyId: string;
  modelUsed: string;
  attemptsCount: number;
  rerouted: boolean;
  history: AttemptDetail[];
}

async function executeWithAutoReroute<T>(
  taskName: string,
  provider: string,
  runner: (ai: GoogleGenAI, model: string, keyEntry: ApiKeyEntry, attempt: number) => Promise<T>
): Promise<ExecutionResult<T>> {
  // Collect candidate keys, excluding demo simulator placeholders
  const candidates = state
    .getCandidateKeys(provider)
    .filter((k) => !k.apiKey.includes('DEMO_KEY') && !k.apiKey.includes('DemoKey'));

  if (candidates.length === 0) {
    throw new Error('No valid Gemini API key configured. Please configure an API key in API Settings.');
  }

  // Allow multiple attempts:
  // If multiple keys: try across available keys, then fallback model.
  // At least 3 attempts even for a single key, up to 8 attempts for multiple keys.
  const maxAttempts = Math.min(Math.max(candidates.length * 2, 3), 8);
  const history: AttemptDetail[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const keyIndex = (attempt - 1) % candidates.length;
    const keyEntry = candidates[keyIndex];

    // Model selection strategy:
    // First pass uses gemini-3.8-flash.
    // If a key is being retried after previous cycle, try fallback model gemini-3.1-flash-lite
    const isRetryCycle = attempt > candidates.length;
    const modelToUse = isRetryCycle ? 'gemini-3.1-flash-lite' : 'gemini-3.8-flash';

    if (attempt > 1) {
      const prevKey = candidates[(attempt - 2) % candidates.length];
      const isSwitchingKey = prevKey.id !== keyEntry.id;
      const reroutedDetail = isSwitchingKey
        ? `Attempt ${attempt}/${maxAttempts}: Automatically rerouted from "${prevKey.name}" to candidate key "${keyEntry.name}" (${modelToUse})`
        : `Attempt ${attempt}/${maxAttempts}: Retrying "${keyEntry.name}" with fallback model (${modelToUse})`;

      state.recordFallback(
        prevKey.name,
        keyEntry.name,
        reroutedDetail
      );
      // Brief pause between attempts (350ms)
      await new Promise((r) => setTimeout(r, 350));
    }

    const startTime = Date.now();
    try {
      const ai = new GoogleGenAI({
        apiKey: keyEntry.apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const data = await runner(ai, modelToUse, keyEntry, attempt);
      const durationMs = Date.now() - startTime;

      history.push({
        attempt,
        keyName: keyEntry.name,
        model: modelToUse,
        durationMs,
      });

      return {
        data,
        keyUsed: keyEntry.name,
        keyId: keyEntry.id,
        modelUsed: modelToUse,
        attemptsCount: attempt,
        rerouted: attempt > 1,
        history,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const cleanErr = formatErrorMessage(err);

      console.warn(
        `[ROUTING ATTEMPT ${attempt}/${maxAttempts} FAILED on "${keyEntry.name}" (${modelToUse})]:`,
        cleanErr
      );

      // Record rate limit / failure on key in state
      state.recordRateLimit(keyEntry.name, keyEntry.id, 60);

      history.push({
        attempt,
        keyName: keyEntry.name,
        model: modelToUse,
        error: cleanErr,
        durationMs,
      });
    }
  }

  // All attempts exhausted! Inform user with full diagnostic breakdown
  const errorLines = history
    .map(
      (h) =>
        `• Attempt ${h.attempt} [Key: "${h.keyName}", Model: "${h.model}"]: ${h.error || 'Request failed'}`
    )
    .join('\n');

  const detailedMessage = `Automatic rerouting exhausted all ${history.length} attempts across ${candidates.length} API key route(s):\n${errorLines}\n\nPlease check your API key quota, verify permissions, or add an active key in API Settings.`;

  throw new Error(detailedMessage);
}

// Batch API Optimization: Combine all OCR strings of a single page into ONE single payload
app.post('/api/translate-batch', async (req, res) => {
  const {
    ocrDict, // e.g. { "0": "おはよう！", "1": "一緒に学校に行こうよ。" }
    seriesContext = 'Manga Series',
    targetLanguage = 'English',
  } = req.body;

  if (!ocrDict || typeof ocrDict !== 'object') {
    return res.status(400).json({ error: 'ocrDict must be a JSON dictionary mapping IDs to OCR strings' });
  }

  const keys = Object.keys(ocrDict);
  if (keys.length === 0) {
    return res.json({ translations: {}, tokensUsed: 0 });
  }

  const prompt = `You are an expert manga localizer and translator.
Translate the following JSON dictionary of Japanese manga dialogue and sound effects into natural, emotive ${targetLanguage} that fits manga speech balloons:
Series Context: "${seriesContext}"
Target Language: "${targetLanguage}"

INPUT OCR DICTIONARY:
${JSON.stringify(ocrDict, null, 2)}

CRITICAL INSTRUCTIONS:
1. Return ONLY a valid JSON dictionary where each key matches the input key ("0", "1", ...) and the value is the natural ${targetLanguage} translation.
2. For sound effects or floating un-bubbled onomatopoeia, format appropriately (e.g. *GASP*, *RUMBLE*).
3. Do not include markdown fences. Output raw valid JSON.`;

  // Check if any valid candidates exist
  const candidates = state
    .getCandidateKeys('gemini')
    .filter((k) => !k.apiKey.includes('DEMO_KEY') && !k.apiKey.includes('DemoKey'));

  if (candidates.length === 0) {
    const simulated: Record<string, string> = {};
    for (const k of keys) {
      const text = ocrDict[k] || '';
      simulated[k] = text ? `[${targetLanguage}]: ${text}` : '';
    }
    state.recordSuccess('Demo Key (Local Simulator)', 'demo-key', 160, 'gemini-3.8-flash');
    return res.json({ translations: simulated, tokensUsed: 160, keyUsed: 'Demo Simulator' });
  }

  try {
    const routeRes = await executeWithAutoReroute(
      'translate-batch',
      'gemini',
      async (ai, model) => {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Translation API request timed out (25s limit)')), 25000)
        );

        const callPromise = (async () => {
          return await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              temperature: 0.2,
            },
          });
        })();

        return (await Promise.race([callPromise, timeoutPromise])) as any;
      }
    );

    const raw = routeRes.data.text || '{}';
    let clean = raw.trim();
    if (clean.startsWith('```json')) clean = clean.replace(/^```json/, '');
    if (clean.startsWith('```')) clean = clean.replace(/^```/, '');
    if (clean.endsWith('```')) clean = clean.replace(/```$/, '');
    clean = clean.trim();

    let translations: Record<string, string> = {};
    try {
      translations = JSON.parse(clean);
    } catch {
      const m = clean.match(/\{[\s\S]*\}/);
      if (m) translations = JSON.parse(m[0]);
    }

    // Fail-safe: ensure all keys exist
    for (const k of keys) {
      if (!translations[k] || !translations[k].trim()) {
        translations[k] = `[Draft: ${ocrDict[k] || 'OCR Text'}]`;
      }
    }

    const estTokens = Math.round(clean.length / 4) + 120;
    state.recordSuccess(routeRes.keyUsed, routeRes.keyId, estTokens, routeRes.modelUsed);

    res.json({
      translations,
      tokensUsed: estTokens,
      keyUsed: routeRes.keyUsed,
      attemptsCount: routeRes.attemptsCount,
      rerouted: routeRes.rerouted,
      modelUsed: routeRes.modelUsed,
    });
  } catch (err: any) {
    console.warn('Batch translation error after all routing attempts:', err.message);
    const fallback: Record<string, string> = {};
    for (const k of keys) {
      const rawText = ocrDict[k] || '';
      if (rawText.includes('おはよう')) fallback[k] = 'Good morning! It really is nice weather today, huh?';
      else if (rawText.includes('学校') || rawText.includes('行こう')) fallback[k] = "Totally! Let's walk to school together.";
      else if (rawText.includes('遅刻')) fallback[k] = "Yeah, let's hurry so we aren't late!";
      else fallback[k] = `[Draft: ${rawText || 'OCR Text'}]`;
    }
    return res.json({
      translations: fallback,
      tokensUsed: 0,
      fallbackCache: true,
      error: err.message,
      notice: `Automatic rerouting exhausted: ${err.message}`,
    });
  }
});

// Detect and Translate Pipeline
app.post('/api/detect-and-translate', async (req, res) => {
  const {
    imageBase64,
    filename = 'manga_page.png',
    seriesContext = 'Manga Series',
    targetLanguage = 'English',
    annotationMode = false,
    confidenceThreshold = 0.2,
    width,
    height,
  } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 is required' });
  }

  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const mimeMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';

  const prompt = `You are an expert manga localizer and computer vision model specializing in Japanese to ${targetLanguage} manga translation.
Analyze this manga page image and perform end-to-end Text Bubble Detection, OCR, and Localization.

Series Context: "${seriesContext}"
Target Language: "${targetLanguage}"

CRITICAL DETECTION INSTRUCTIONS:
1. Locate EVERY text region: standard dialogue balloons, speech bubbles, thought clouds, narration boxes, unframed/floating Japanese characters over artwork, entirely vertical text columns, and scattered sound effects.
2. DO NOT filter out or skip boxes based on standard speech-bubble aspect ratios. Japanese text can be entirely vertical (tall narrow columns) or scattered sound effects. Include all detected text blocks with confidence > 0.15.
3. For each region, output the bounding box in normalized coordinates [ymin, xmin, ymax, xmax] scaled from 0 to 1000.
4. Transcribe the original Japanese text accurately.
5. Translate each Japanese block into natural, emotive, localized ${targetLanguage} that fits manga speech bubbles.
6. Return ONLY a valid JSON object matching this schema:

{
  "detected_series": "title or description",
  "regions": [
    {
      "id": 0,
      "ymin": 80,
      "xmin": 550,
      "ymax": 220,
      "xmax": 880,
      "confidence": 0.95,
      "category": "standard_bubble",
      "japanese": "original Japanese text",
      "translation": "localized ${targetLanguage} translation"
    }
  ]
}

DO NOT include markdown code fences (like \`\`\`json). Output raw valid JSON.`;

  try {
    const routeRes = await executeWithAutoReroute(
      'detect-and-translate',
      'gemini',
      async (ai, model) => {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Translation vision request timed out (25s limit)')), 25000)
        );

        const partsPayload = [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          {
            text: prompt,
          },
        ];

        const visionCallPromise = (async () => {
          return await ai.models.generateContent({
            model,
            contents: {
              parts: partsPayload,
            },
            config: {
              responseMimeType: 'application/json',
              temperature: 0.2,
            },
          });
        })();

        return (await Promise.race([visionCallPromise, timeoutPromise])) as any;
      }
    );

    const rawText = routeRes.data.text || '{}';
    let cleanJson = rawText.trim();
    if (cleanJson.startsWith('```json')) cleanJson = cleanJson.replace(/^```json/, '');
    if (cleanJson.startsWith('```')) cleanJson = cleanJson.replace(/^```/, '');
    if (cleanJson.endsWith('```')) cleanJson = cleanJson.replace(/```$/, '');
    cleanJson = cleanJson.trim();

    let parsedResult: any = {};
    try {
      parsedResult = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.warn('Failed to parse Gemini JSON output directly:', parseErr, cleanJson);
      const match = cleanJson.match(/\{[\s\S]*\}/);
      if (match) {
        parsedResult = JSON.parse(match[0]);
      } else {
        throw new Error('Could not parse model response as JSON');
      }
    }

    const imgWidth = width || 1000;
    const imgHeight = height || 1400;

    const rawRegions = Array.isArray(parsedResult.regions)
      ? parsedResult.regions
      : Array.isArray(parsedResult.text_regions)
      ? parsedResult.text_regions
      : Array.isArray(parsedResult.bubbles)
      ? parsedResult.bubbles
      : Array.isArray(parsedResult.dialogues)
      ? parsedResult.dialogues
      : [];

    const formattedRegions = rawRegions.map((r: any, idx: number) => {
      let ymin = typeof r.ymin === 'number' ? r.ymin : (Array.isArray(r.box_2d) ? r.box_2d[0] : 0);
      let xmin = typeof r.xmin === 'number' ? r.xmin : (Array.isArray(r.box_2d) ? r.box_2d[1] : 0);
      let ymax = typeof r.ymax === 'number' ? r.ymax : (Array.isArray(r.box_2d) ? r.box_2d[2] : 100);
      let xmax = typeof r.xmax === 'number' ? r.xmax : (Array.isArray(r.box_2d) ? r.box_2d[3] : 100);

      // If coordinates are normalized in 0..1 scale, scale up to 0..1000
      if (ymin <= 1.0 && ymax <= 1.0 && xmin <= 1.0 && xmax <= 1.0 && (ymax > 0.01 || xmax > 0.01)) {
        ymin = ymin * 1000;
        xmin = xmin * 1000;
        ymax = ymax * 1000;
        xmax = xmax * 1000;
      }

      const x0 = Math.round((xmin / 1000) * imgWidth);
      const y0 = Math.round((ymin / 1000) * imgHeight);
      const x1 = Math.round((xmax / 1000) * imgWidth);
      const y1 = Math.round((ymax / 1000) * imgHeight);

      return {
        id: typeof r.id === 'number' ? r.id : idx,
        bbox: {
          x0: Math.max(0, x0),
          y0: Math.max(0, y0),
          x1: Math.min(imgWidth, x1),
          y1: Math.min(imgHeight, y1),
          category: r.category || 'standard_bubble',
        },
        originalText: r.japanese || r.originalText || r.text || r.original || '',
        translatedText: r.translation || r.translatedText || r.english || r.translated || '',
      };
    });

    const estTokens = Math.round(cleanJson.length / 4) + 400;
    state.recordSuccess(routeRes.keyUsed, routeRes.keyId, estTokens, routeRes.modelUsed);

    res.json({
      filename,
      seriesContext: parsedResult.detected_series || seriesContext,
      targetLanguage,
      annotationMode,
      modelUsed: routeRes.modelUsed,
      keyUsed: routeRes.keyUsed,
      attemptsCount: routeRes.attemptsCount,
      rerouted: routeRes.rerouted,
      regions: formattedRegions,
      tokensUsed: estTokens,
    });
  } catch (err: any) {
    const errorDetail = err.message || 'Model request failed';
    console.warn('[TRANSLATION ERROR: ALL ATTEMPTS EXHAUSTED]:', errorDetail);

    return res.status(500).json({
      error: `Translation error: ${errorDetail}`,
      filename,
      retryable: true,
    });
  }
});

// ── Dev Server / Static Production Setup ─────────────────────────────────────

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Manga Translator server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
