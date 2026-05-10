import { toolRegistry } from './registry';
import type { ToolContext, ToolResult } from './registry';
import { db } from '../services/firebase';
import { decrypt } from '../services/encryption';
import { randomUUID } from 'crypto';

// ─── Shared types ────────────────────────────────────────────────────────────

interface MemoryDocument {
  id: string;
  userId: string;
  content: string;
  type: 'preference' | 'fact' | 'rule' | 'identity_hint';
  sitePattern?: string;
  tags: string[];
  lastUsed?: string;
  useCount: number;
  createdAt: string;
  updatedAt: string;
}

interface IdentityDocument {
  userId: string;
  name: string;
  siteUrl: string;
  username: string;
  passwordEncrypted: string;
  createdAt: string;
  updatedAt: string;
  lastUsed: string | null;
  deletedAt: string | null;
}

interface SitePreferenceDocument {
  id: string;
  userId: string;
  sitePattern: string;
  defaults: Record<string, string>;
  overrideRules: { triggerKeyword: string; targetField: string; setValue: string }[];
  createdAt: string;
  updatedAt: string;
}

// ─── Memory scoring (same algorithm as memory routes) ────────────────────────

function scoreMemory(
  mem: MemoryDocument,
  queryWords: string[],
  url: string | undefined,
): number {
  let score = 0;

  if (queryWords.length > 0) {
    const contentLower = mem.content.toLowerCase();
    const matchingWords = queryWords.filter((w) => contentLower.includes(w));
    score += (matchingWords.length / queryWords.length) * 40;
  }

  if (mem.sitePattern && url) {
    const normalizedUrl = url.replace(/^https?:\/\//, '').toLowerCase();
    const pattern = mem.sitePattern.toLowerCase();
    if (normalizedUrl.includes(pattern) || pattern.includes(normalizedUrl)) {
      score += 30;
    }
  }

  if (mem.lastUsed) {
    const daysSince =
      (Date.now() - new Date(mem.lastUsed).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 1) score += 20;
    else if (daysSince < 7) score += 15;
    else if (daysSince < 30) score += 10;
  }

  score += Math.min(mem.useCount * 2, 10);

  return score;
}

function autoExtractTags(content: string, userTags: string[]): string[] {
  const words = content.split(/\s+/);
  const extracted = words
    .filter((w) => w.length > 4)
    .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length > 4);
  const merged = Array.from(new Set([...extracted, ...userTags.map((t) => t.toLowerCase())]));
  return merged;
}

// ─── Tool registrations ───────────────────────────────────────────────────────

// navigate — go to a URL in the current tab
toolRegistry.register({
  name: 'navigate',
  description:
    'Navigate the current browser tab to a URL. Use this to go to a different page in the same tab.',
  category: 'navigation',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The full URL to navigate to (must start with http:// or https://)' },
    },
    required: ['url'],
  },
  async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const url = params['url'] as string;
    return context.sendBridgeAction('navigate', { url });
  },
});

// openTab — open a URL in a brand-new tab (use when user says "open in new tab")
toolRegistry.register({
  name: 'openTab',
  description:
    'Open a URL in a new browser tab. Use this when the user asks to "open in new tab" or when you want to open a page without leaving the current one. After the tab opens, call takeSnapshot to interact with it.',
  category: 'navigation',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The full URL to open in a new tab (must start with http:// or https://)' },
    },
    required: ['url'],
  },
  async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const url = params['url'] as string;
    return context.sendBridgeAction('newtab', { url });
  },
});

// takeScreenshot
toolRegistry.register({
  name: 'takeScreenshot',
  description:
    'Take a screenshot of the current page. Use after every navigation and after every action to verify the result.',
  category: 'observation',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    return context.sendBridgeAction('screenshot', {});
  },
});

// takeSnapshot — ref-based page intelligence
toolRegistry.register({
  name: 'takeSnapshot',
  description:
    'Get a structured snapshot of the current page with all interactive elements labeled (@e1, @e2, ...). ' +
    'Always call this first before any interaction. Returns element refs you can use with clickRef/typeRef.',
  category: 'observation',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    return context.sendBridgeAction('snapshot', {});
  },
});

// clickRef — ref-based click using snapshot element references
toolRegistry.register({
  name: 'clickRef',
  description:
    'Click an element by its ref from a snapshot (e.g. "@e3"). Always call takeSnapshot first to get refs.',
  category: 'interaction',
  inputSchema: {
    type: 'object',
    properties: {
      ref: { type: 'string', description: 'Element ref from snapshot, e.g. "@e3" or "e3"' },
    },
    required: ['ref'],
  },
  async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const ref = (params['ref'] as string).replace('@', '');
    return context.sendBridgeAction('click_ref', { ref });
  },
});

// typeRef — ref-based text input using snapshot element references
toolRegistry.register({
  name: 'typeRef',
  description:
    'Type text into an input field identified by its ref from a snapshot (e.g. "@e5"). ' +
    'Use takeSnapshot first to identify the correct field ref.',
  category: 'interaction',
  inputSchema: {
    type: 'object',
    properties: {
      ref: { type: 'string', description: 'Element ref from snapshot, e.g. "@e5" or "e5"' },
      text: { type: 'string', description: 'Text to type into the field' },
      clearFirst: {
        type: 'boolean',
        description: 'Clear existing value before typing (default: true)',
      },
    },
    required: ['ref', 'text'],
  },
  async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const ref = (params['ref'] as string).replace('@', '');
    const text = params['text'] as string;
    const clearFirst = params['clearFirst'] !== false;
    return context.sendBridgeAction('type_ref', { ref, text, clearFirst });
  },
});

// waitForCondition — polling wait strategies
toolRegistry.register({
  name: 'waitForCondition',
  description:
    'Wait for a page condition before continuing. Useful after navigation, form submission, or animations.',
  category: 'navigation',
  inputSchema: {
    type: 'object',
    properties: {
      conditionType: {
        type: 'string',
        enum: ['element-visible', 'element-gone', 'text-present', 'url-contains', 'page-mutated', 'network-idle', 'delay'],
        description: 'Type of condition to wait for. Use page-mutated after OAuth/social login clicks (URL does not change but page content updates). Use text-present to wait for specific post-login UI text.',
      },
      ref: { type: 'string', description: 'Element ref for element-visible/element-gone conditions' },
      text: { type: 'string', description: 'Text to look for (text-present condition)' },
      substring: { type: 'string', description: 'URL substring (url-contains condition)' },
      ms: { type: 'number', description: 'Milliseconds (delay condition)' },
      timeoutMs: { type: 'number', description: 'Max wait time in ms (default: 25000)' },
    },
    required: ['conditionType'],
  },
  async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const condition: Record<string, unknown> = {
      type: params['conditionType'],
    };
    if (params['ref']) condition['ref'] = (params['ref'] as string).replace('@', '');
    if (params['text']) condition['text'] = params['text'];
    if (params['substring']) condition['substring'] = params['substring'];
    if (params['ms']) condition['ms'] = params['ms'];

    return context.sendBridgeAction('wait', {
      condition,
      timeoutMs: params['timeoutMs'] ?? 25000,
    });
  },
});

// clickElement
toolRegistry.register({
  name: 'clickElement',
  description:
    'Click on an element described by text or coordinates. First take a screenshot to identify the element, then click. After clicking, take another screenshot to verify.',
  category: 'interaction',
  inputSchema: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'Text description of the element to click (e.g. button label, link text)',
      },
      x: {
        type: 'number',
        description: 'Optional X coordinate for the click',
      },
      y: {
        type: 'number',
        description: 'Optional Y coordinate for the click',
      },
    },
    required: ['description'],
  },
  async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const { description, x, y } = params as { description: string; x?: number; y?: number };
    return context.sendBridgeAction('click', { description, x, y });
  },
});

// typeText
toolRegistry.register({
  name: 'typeText',
  description:
    "Type text into an input field. Identify the field by its label or placeholder text. Set clearFirst=true to clear existing content first.",
  category: 'interaction',
  inputSchema: {
    type: 'object',
    properties: {
      fieldDescription: {
        type: 'string',
        description: 'Label or placeholder text that identifies the input field',
      },
      text: { type: 'string', description: 'The text to type into the field' },
      clearFirst: {
        type: 'boolean',
        description: 'Whether to clear existing content before typing (default: true)',
      },
    },
    required: ['fieldDescription', 'text'],
  },
  async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const { fieldDescription, text, clearFirst } = params as {
      fieldDescription: string;
      text: string;
      clearFirst?: boolean;
    };
    return context.sendBridgeAction('type', {
      fieldDescription,
      text,
      clearFirst: clearFirst ?? true,
    });
  },
});

// selectOption
toolRegistry.register({
  name: 'selectOption',
  description:
    'Select an option from a dropdown menu. Identify the dropdown by its label and specify the option text to select.',
  category: 'form',
  inputSchema: {
    type: 'object',
    properties: {
      dropdownDescription: {
        type: 'string',
        description: 'Label or identifier for the dropdown element',
      },
      optionText: { type: 'string', description: 'The text of the option to select' },
    },
    required: ['dropdownDescription', 'optionText'],
  },
  async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const { dropdownDescription, optionText } = params as {
      dropdownDescription: string;
      optionText: string;
    };
    return context.sendBridgeAction('select', { dropdownDescription, optionText });
  },
});

// pressKey
toolRegistry.register({
  name: 'pressKey',
  description:
    "Press a keyboard key. Use 'Enter' to submit forms, 'Tab' to move between fields, 'Escape' to close dialogs.",
  category: 'interaction',
  inputSchema: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description: 'The key to press (e.g. "Enter", "Tab", "Escape")',
      },
    },
    required: ['key'],
  },
  async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const { key } = params as { key: string };
    return context.sendBridgeAction('pressKey', { key });
  },
});

// scrollPage
toolRegistry.register({
  name: 'scrollPage',
  description: 'Scroll the page up or down. Use when content is off-screen.',
  category: 'navigation',
  inputSchema: {
    type: 'object',
    properties: {
      direction: {
        type: 'string',
        description: 'Direction to scroll',
        enum: ['up', 'down'],
      },
      amount: {
        type: 'number',
        description: 'Number of pixels to scroll (default: 300)',
      },
    },
    required: ['direction'],
  },
  async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const { direction, amount } = params as { direction: 'up' | 'down'; amount?: number };
    return context.sendBridgeAction('scroll', { direction, amount: amount ?? 300 });
  },
});

// addFormRow
toolRegistry.register({
  name: 'addFormRow',
  description:
    "Click the 'Add Row' or '+' button in a dynamic form to add a new entry. Use for DSR-type forms that need multiple task rows.",
  category: 'form',
  inputSchema: {
    type: 'object',
    properties: {
      buttonHint: {
        type: 'string',
        description: "Text or description of the add-row button (e.g. 'Add Row', '+')",
      },
    },
    required: ['buttonHint'],
  },
  async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const { buttonHint } = params as { buttonHint: string };
    const clickResult = await context.sendBridgeAction('click', { description: buttonHint });
    if (!clickResult.success) {
      return clickResult;
    }
    const screenshotResult = await context.sendBridgeAction('screenshot', {});
    return screenshotResult;
  },
});

// readMemory
toolRegistry.register({
  name: 'readMemory',
  description:
    'Search user memories for relevant preferences, facts, rules, and identity hints. ALWAYS call this at the start of every task to load relevant context. Pass the current URL as currentUrl for better results.',
  category: 'memory',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query to find relevant memories' },
      currentUrl: {
        type: 'string',
        description: 'Current page URL for site-specific memory filtering',
      },
    },
    required: ['query'],
  },
  async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const { query, currentUrl } = params as { query: string; currentUrl?: string };

    try {
      const queryWords = query
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 0);

      const itemsRef = db
        .collection('memories')
        .doc(context.userId)
        .collection('items');
      const snapshot = await itemsRef.get();

      const scored: { memory: MemoryDocument; score: number }[] = snapshot.docs
        .map((doc) => {
          const mem = doc.data() as MemoryDocument;
          if (!mem.id) mem.id = doc.id;
          return { memory: mem, score: scoreMemory(mem, queryWords, currentUrl) };
        })
        .filter((item) => item.score >= 10)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      const memories = scored.map((s) => ({
        id: s.memory.id,
        content: s.memory.content,
        type: s.memory.type,
        sitePattern: s.memory.sitePattern,
        score: s.score,
      }));

      return { success: true, data: { memories } };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});

// writeMemory
toolRegistry.register({
  name: 'writeMemory',
  description:
    "Save important information to memory. Call immediately when user says 'yaad rakhlo' or 'remember that' or provides a rule/preference. Duplicate content is automatically handled.",
  category: 'memory',
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'The information to save to memory' },
      type: {
        type: 'string',
        description: 'The type of memory',
        enum: ['preference', 'fact', 'rule', 'identity_hint'],
      },
      sitePattern: {
        type: 'string',
        description: 'Optional site domain pattern this memory applies to (e.g. "github.com")',
      },
    },
    required: ['content', 'type'],
  },
  async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const { content, type, sitePattern } = params as {
      content: string;
      type: 'preference' | 'fact' | 'rule' | 'identity_hint';
      sitePattern?: string;
    };

    try {
      const trimmedContent = content.trim();
      const itemsRef = db
        .collection('memories')
        .doc(context.userId)
        .collection('items');

      // Duplicate detection (case-insensitive)
      const snapshot = await itemsRef.get();
      const duplicate = snapshot.docs.find(
        (doc) =>
          (doc.data() as MemoryDocument).content.toLowerCase() ===
          trimmedContent.toLowerCase(),
      );

      const now = new Date().toISOString();

      if (duplicate) {
        const existing = duplicate.data() as MemoryDocument;
        await duplicate.ref.update({
          updatedAt: now,
          lastUsed: now,
          useCount: existing.useCount + 1,
        });
        return {
          success: true,
          data: { id: duplicate.id, updated: true, content: trimmedContent },
        };
      }

      const autoTags = autoExtractTags(trimmedContent, []);
      const docData: MemoryDocument = {
        id: '',
        userId: context.userId,
        content: trimmedContent,
        type,
        sitePattern: sitePattern ?? undefined,
        tags: autoTags,
        useCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      const docRef = await itemsRef.add(docData);
      await docRef.update({ id: docRef.id });

      return {
        success: true,
        data: { id: docRef.id, updated: false, content: trimmedContent },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});

// listIdentities — show agent what's in the vault (no passwords)
toolRegistry.register({
  name: 'listIdentities',
  description:
    "List all saved vault identities (name and site URL only — no passwords). Call this first when the user says 'get from vault' or 'use my saved credentials', so you know which identity name to use with getIdentity.",
  category: 'identity',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const itemsRef = db
        .collection('identities')
        .doc(context.userId)
        .collection('items');
      const snapshot = await itemsRef.where('deletedAt', '==', null).get();

      const identities = snapshot.docs.map((doc) => {
        const d = doc.data() as IdentityDocument;
        return { name: d.name, siteUrl: d.siteUrl ?? '' };
      });

      return { success: true, data: { identities } };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});

// getIdentity
toolRegistry.register({
  name: 'getIdentity',
  description:
    "Get saved login credentials by identity name (e.g. 'Jeel', 'Dev'). Returns username and password. Use when user says 'login as [name]' or when you need credentials for a site. Call listIdentities first if you don't know the exact name.",
  category: 'identity',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'The identity name to look up (case-insensitive)',
      },
      siteUrl: {
        type: 'string',
        description: 'Optional: current page URL to find the best-matching identity by site',
      },
    },
    required: ['name'],
  },
  async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const { name, siteUrl } = params as { name: string; siteUrl?: string };

    try {
      const itemsRef = db
        .collection('identities')
        .doc(context.userId)
        .collection('items');
      const snapshot = await itemsRef.where('deletedAt', '==', null).get();

      const docs = snapshot.docs.map((doc) => ({ ref: doc.ref, data: doc.data() as IdentityDocument, id: doc.id }));

      // 1. Exact name match (case-insensitive)
      let match = docs.find((d) => d.data.name.toLowerCase() === name.toLowerCase());

      // 2. If not found by name and a siteUrl is provided, try hostname match
      if (!match && siteUrl) {
        let targetHost = '';
        try { targetHost = new URL(siteUrl).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
        if (targetHost) {
          match = docs.find((d) => {
            let identityHost = '';
            try { identityHost = new URL(d.data.siteUrl ?? '').hostname.replace(/^www\./, ''); } catch { /* ignore */ }
            return identityHost && targetHost.includes(identityHost) || identityHost.includes(targetHost);
          });
        }
      }

      // 3. Partial name match as last resort
      if (!match) {
        match = docs.find((d) => d.data.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(d.data.name.toLowerCase()));
      }

      if (!match) {
        const available = docs.map((d) => d.data.name).join(', ');
        return {
          success: false,
          error: `Identity '${name}' not found. Available identities: ${available || 'none'}. Call listIdentities to see all saved credentials.`,
        };
      }

      const doc = match.data;
      const password = decrypt(doc.passwordEncrypted);

      // Update lastUsed
      await match.ref.update({ lastUsed: new Date().toISOString() });

      return {
        success: true,
        data: {
          id: match.id,
          name: doc.name,
          siteUrl: doc.siteUrl,
          username: doc.username,
          password,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});

// getSitePrefs
toolRegistry.register({
  name: 'getSitePrefs',
  description:
    "Get default field values and override rules for the current site URL. Call this before filling any form to apply user's saved preferences automatically.",
  category: 'form',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The current page URL to look up site preferences for',
      },
    },
    required: ['url'],
  },
  async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const { url } = params as { url: string };

    try {
      const sitesRef = db
        .collection('sitePreferences')
        .doc(context.userId)
        .collection('sites');
      const snapshot = await sitesRef.get();

      const prefs: SitePreferenceDocument[] = snapshot.docs.map((doc) => {
        const data = doc.data() as SitePreferenceDocument;
        if (!data.id) data.id = doc.id;
        return data;
      });

      const normalizedUrl = url.trim().toLowerCase();

      const matches = prefs.filter((pref) => {
        const pattern = pref.sitePattern.toLowerCase();
        return normalizedUrl.includes(pattern) || pattern.includes(normalizedUrl);
      });

      if (matches.length === 0) {
        return { success: true, data: { prefs: null } };
      }

      // Pick the most specific match (longest sitePattern)
      const best = matches.reduce((prev, curr) =>
        curr.sitePattern.length > prev.sitePattern.length ? curr : prev,
      );

      return {
        success: true,
        data: {
          prefs: {
            id: best.id,
            sitePattern: best.sitePattern,
            defaults: best.defaults,
            overrideRules: best.overrideRules,
          },
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});

// sendProgress
toolRegistry.register({
  name: 'sendProgress',
  description:
    'Send a real-time progress message to the user. Use this to keep the user informed about what you are doing. Call frequently.',
  category: 'communication',
  inputSchema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'The progress message to send to the user' },
      status: {
        type: 'string',
        description: 'The status type of the message',
        enum: ['info', 'success', 'error'],
      },
    },
    required: ['message'],
  },
  async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const { message, status } = params as { message: string; status?: 'info' | 'success' | 'error' };
    await context.sendProgress(status ?? 'info', message);
    return { success: true, data: { sent: true } };
  },
});

// askUserQuestion — sends a question popup to the user and WAITS for their answer
toolRegistry.register({
  name: 'askUserQuestion',
  description:
    'Ask the user a question when you need clarification. Waits for the user to answer before continuing. Use when the command is genuinely ambiguous. Provide options when possible to make it easier to respond.',
  category: 'communication',
  noTimeout: true, // user may take time to respond; skip the 60s tool timeout
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The question to ask the user' },
      options: {
        type: 'string',
        description: 'Optional comma-separated list of answer options (e.g. "Yes,No,Cancel")',
      },
    },
    required: ['question'],
  },
  async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const { question, options } = params as { question: string; options?: string };
    const optionsArray = options
      ? options
          .split(',')
          .map((o) => o.trim())
          .filter((o) => o.length > 0)
      : undefined;

    const questionId = randomUUID();

    // Notify the frontend — it will render a popup and POST the answer to /agent/answer
    await context.sendProgress(
      'asking',
      JSON.stringify({ questionId, question, options: optionsArray }),
    );

    // Block until the user answers (or 10-minute auto-expire)
    const answer = await context.waitForUserAnswer(questionId);

    if (!answer) {
      return {
        success: true,
        data: { answer: '', note: 'User did not respond within the timeout.' },
      };
    }

    return {
      success: true,
      data: { answer },
    };
  },
});

// taskComplete
toolRegistry.register({
  name: 'taskComplete',
  description:
    'Call this when the task is fully complete. Provide a clear summary of what was accomplished.',
  category: 'workflow',
  inputSchema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'A clear summary of what was accomplished',
      },
    },
    required: ['summary'],
  },
  async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const { summary } = params as { summary: string };
    await context.sendProgress('complete', summary);
    return { success: true, data: { completed: true, summary } };
  },
});

// Suppress unused import warning — randomUUID is used for future tooling needs
void randomUUID;
