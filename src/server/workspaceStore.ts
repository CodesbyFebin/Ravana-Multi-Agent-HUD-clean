import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { MemoryItem, TaskItem, AgentId } from '../lib/types.ts';
import { redactSecretsAndPII } from '../lib/memory.ts';

const AGENTS = new Set<AgentId>([
  'queen', 'coder', 'pr_reviewer', 'devops', 'trader', 'social', 'researcher', 'scheduler', 'security', 'comms',
]);
const TASK_STATUSES = new Set<TaskItem['status']>(['todo', 'in_progress', 'review', 'done']);
const PRIORITIES = new Set<TaskItem['priority']>(['low', 'medium', 'high', 'critical']);
const MEMORY_CATEGORIES = new Set<MemoryItem['category']>(['preference', 'conversation', 'business', 'server', 'trade', 'code']);
const MAX_TASKS = 2000;
const MAX_MEMORIES = 2000;

function readArray<T>(filePath: string): T[] {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}

function writeArray<T>(filePath: string, values: T[]): void {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(values, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}

function boundedString(value: unknown, field: string, max: number, required = false): string {
  if (value === undefined || value === null) {
    if (required) throw new TypeError(`${field} is required`);
    return '';
  }
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`);
  const clean = value.trim();
  if (required && !clean) throw new TypeError(`${field} is required`);
  if (clean.length > max) throw new TypeError(`${field} must be ${max} characters or fewer`);
  return clean;
}

export class WorkspaceStore {
  private readonly tasksFile: string;
  private readonly memoriesFile: string;
  private tasks: TaskItem[];
  private memories: MemoryItem[];

  constructor(dataDir = path.resolve(process.cwd(), '.ravana-data')) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    this.tasksFile = path.join(dataDir, 'tasks.json');
    this.memoriesFile = path.join(dataDir, 'user-memories.json');
    this.tasks = readArray<TaskItem>(this.tasksFile).slice(0, MAX_TASKS);
    this.memories = readArray<MemoryItem>(this.memoriesFile).slice(0, MAX_MEMORIES);
  }

  listTasks(): TaskItem[] {
    return structuredClone(this.tasks);
  }

  createTask(input: unknown): TaskItem {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Task body must be an object');
    const body = input as Record<string, unknown>;
    const title = boundedString(body.title, 'title', 240, true);
    const description = boundedString(body.description, 'description', 2000);
    const agent = body.assignedAgent === undefined ? 'queen' : body.assignedAgent;
    if (typeof agent !== 'string' || !AGENTS.has(agent as AgentId)) throw new TypeError('assignedAgent is invalid');
    const priority = body.priority === undefined ? 'medium' : body.priority;
    if (typeof priority !== 'string' || !PRIORITIES.has(priority as TaskItem['priority'])) throw new TypeError('priority is invalid');
    const status = body.status === undefined ? 'todo' : body.status;
    if (typeof status !== 'string' || !TASK_STATUSES.has(status as TaskItem['status'])) throw new TypeError('status is invalid');
    const tagsInput = body.tags === undefined ? [] : body.tags;
    if (!Array.isArray(tagsInput) || tagsInput.length > 20 || tagsInput.some((tag) => typeof tag !== 'string')) {
      throw new TypeError('tags must be an array of at most 20 strings');
    }
    if (this.tasks.length >= MAX_TASKS) throw new TypeError('Task capacity reached; remove old tasks before adding more');
    const timestamp = Date.now();
    const task: TaskItem = {
      id: `task_${randomUUID()}`,
      title,
      description,
      status: status as TaskItem['status'],
      assignedAgent: agent as AgentId,
      priority: priority as TaskItem['priority'],
      requiresReview: body.requiresReview === true,
      tags: (tagsInput as string[]).map((tag) => tag.trim().slice(0, 40)).filter(Boolean),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.tasks.unshift(task);
    writeArray(this.tasksFile, this.tasks);
    return structuredClone(task);
  }

  updateTaskStatus(id: string, statusValue: unknown): TaskItem | null {
    if (typeof statusValue !== 'string' || !TASK_STATUSES.has(statusValue as TaskItem['status'])) {
      throw new TypeError('status is invalid');
    }
    const task = this.tasks.find((item) => item.id === id);
    if (!task) return null;
    task.status = statusValue as TaskItem['status'];
    task.updatedAt = Date.now();
    writeArray(this.tasksFile, this.tasks);
    return structuredClone(task);
  }

  listMemories(): MemoryItem[] {
    return structuredClone(this.memories);
  }

  createMemory(input: unknown): MemoryItem {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Memory body must be an object');
    const body = input as Record<string, unknown>;
    const content = boundedString(body.content, 'content', 5000, true);
    const category = body.category === undefined ? 'conversation' : body.category;
    if (typeof category !== 'string' || !MEMORY_CATEGORIES.has(category as MemoryItem['category'])) throw new TypeError('category is invalid');
    const tagsInput = body.tags === undefined ? ['user_note'] : body.tags;
    if (!Array.isArray(tagsInput) || tagsInput.length > 20 || tagsInput.some((tag) => typeof tag !== 'string')) {
      throw new TypeError('tags must be an array of at most 20 strings');
    }
    if (this.memories.length >= MAX_MEMORIES) throw new TypeError('Memory capacity reached; remove old memories before adding more');
    const { redactedText, redactedCount } = redactSecretsAndPII(content);
    const clientRedactedCount = typeof body.redactedItemCount === 'number' && Number.isFinite(body.redactedItemCount)
      ? Math.min(100, Math.max(0, Math.floor(body.redactedItemCount)))
      : 0;
    const memory: MemoryItem = {
      id: `mem_${randomUUID()}`,
      content: redactedText,
      rawRedactedContent: redactedText,
      tags: (tagsInput as string[]).map((tag) => tag.trim().slice(0, 40)).filter(Boolean),
      importance: 5,
      category: category as MemoryItem['category'],
      createdAt: Date.now(),
      source: 'user_vault',
      redactedItemCount: Math.min(100, redactedCount + clientRedactedCount),
    };
    this.memories.unshift(memory);
    writeArray(this.memoriesFile, this.memories);
    return structuredClone(memory);
  }
}
