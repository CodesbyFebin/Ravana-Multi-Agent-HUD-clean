import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkspaceStore } from './workspaceStore.ts';

function withTempStore(run: (directory: string) => void): void {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ravana-workspace-'));
  try { run(directory); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test('workspace tasks persist across store instances and status updates', () => {
  withTempStore((directory) => {
    const first = new WorkspaceStore(directory);
    const task = first.createTask({
      title: 'Review deployment plan',
      assignedAgent: 'devops',
      requiresReview: true,
      tags: ['release'],
    });
    assert.equal(task.status, 'todo');
    assert.equal(task.requiresReview, true);
    assert.equal(first.updateTaskStatus(task.id, 'in_progress')?.status, 'in_progress');

    const second = new WorkspaceStore(directory);
    assert.equal(second.listTasks()[0]?.id, task.id);
    assert.equal(second.listTasks()[0]?.status, 'in_progress');
  });
});

test('workspace task validation rejects bad agent, status, and oversized title', () => {
  withTempStore((directory) => {
    const store = new WorkspaceStore(directory);
    assert.throws(() => store.createTask({ title: 'Task', assignedAgent: 'unknown' }), /assignedAgent/);
    assert.throws(() => store.createTask({ title: 'Task', status: 'blocked' }), /status/);
    assert.throws(() => store.createTask({ title: 'x'.repeat(241) }), /240 characters/);
    assert.throws(() => store.updateTaskStatus('missing', 'blocked'), /status/);
  });
});

test('workspace memories redact secrets before persistence', () => {
  withTempStore((directory) => {
    const store = new WorkspaceStore(directory);
    const memory = store.createMemory({
      content: 'Contact alice@example.com with key sk-123456789012345678901234',
      category: 'conversation',
      tags: ['private-note'],
    });
    assert.ok(memory.redactedItemCount >= 2);
    assert.ok(!memory.content.includes('alice@example.com'));
    assert.ok(!memory.content.includes('sk-123456789012345678901234'));
    const restarted = new WorkspaceStore(directory);
    assert.equal(restarted.listMemories()[0]?.content, memory.content);
  });
});
