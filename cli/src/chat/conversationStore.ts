import fs from 'fs';
import path from 'path';
import os from 'os';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  model?: string;
}

export interface Conversation {
  id: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  projectPath?: string;
  title?: string;
}

const STORE_DIR = path.join(os.homedir(), '.poseidev', 'conversations');

function ensureDir(): void {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
}

export class ConversationStore {
  private messages: Message[] = [];
  private id: string;
  private maxHistory: number;

  constructor(maxHistory: number = 50) {
    this.id = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.maxHistory = maxHistory;
  }

  addMessage(role: 'user' | 'assistant' | 'system', content: string, model?: string): void {
    this.messages.push({
      role,
      content,
      timestamp: Date.now(),
      model,
    });

    // Truncate if over max history
    if (this.messages.length > this.maxHistory) {
      // Keep system messages + last N messages
      const systemMsgs = this.messages.filter(m => m.role === 'system');
      const nonSystem = this.messages.filter(m => m.role !== 'system');
      this.messages = [...systemMsgs, ...nonSystem.slice(-this.maxHistory)];
    }
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  getLastN(n: number): Message[] {
    return this.messages.slice(-n);
  }

  clear(): void {
    this.messages = [];
    this.id = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  save(name?: string): void {
    ensureDir();
    const conversation: Conversation = {
      id: this.id,
      messages: this.messages,
      createdAt: this.messages[0]?.timestamp || Date.now(),
      updatedAt: Date.now(),
      title: name || this.generateTitle(),
    };

    const filename = `${name || this.id}.json`;
    fs.writeFileSync(
      path.join(STORE_DIR, filename),
      JSON.stringify(conversation, null, 2)
    );
  }

  load(nameOrId: string): void {
    ensureDir();
    const filepath = path.join(STORE_DIR, `${nameOrId}.json`);

    if (!fs.existsSync(filepath)) {
      throw new Error(`Conversation not found: ${nameOrId}`);
    }

    const data: Conversation = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    this.messages = data.messages;
    this.id = data.id;
  }

  static listSaved(): { name: string; title?: string; messages: number; date: string }[] {
    ensureDir();
    const files = fs.readdirSync(STORE_DIR).filter(f => f.endsWith('.json'));
    return files.map(f => {
      try {
        const data: Conversation = JSON.parse(
          fs.readFileSync(path.join(STORE_DIR, f), 'utf-8')
        );
        return {
          name: f.replace('.json', ''),
          title: data.title,
          messages: data.messages.length,
          date: new Date(data.updatedAt).toLocaleDateString(),
        };
      } catch {
        return { name: f.replace('.json', ''), messages: 0, date: 'unknown' };
      }
    });
  }

  private generateTitle(): string {
    const firstUserMsg = this.messages.find(m => m.role === 'user');
    if (firstUserMsg) {
      return firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? '...' : '');
    }
    return `Conversation ${new Date().toLocaleDateString()}`;
  }

  getTokenEstimate(): number {
    return this.messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
  }

  fork(): ConversationStore {
    const forked = new ConversationStore(this.maxHistory);
    forked.messages = [...this.messages];
    return forked;
  }
}
