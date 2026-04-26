import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveBoardDrop } from './boardDrop';

describe('board drop mapping', () => {
  it('moves review tasks to done with full progress', () => {
    assert.deepEqual(resolveBoardDrop('done', 'review'), { status: 'done', column: 'done', progress: 100 });
  });

  it('rejects dropping non-review tasks into done', () => {
    assert.equal(resolveBoardDrop('done', 'in-progress'), null);
  });

  it('explains why waiting-approval cards in review cannot drop to done', () => {
    assert.equal(resolveBoardDrop('done', 'waiting-approval'), null);
  });

  it('supports review back to in-progress and todo', () => {
    assert.deepEqual(resolveBoardDrop('in-progress', 'review'), { status: 'in-progress', column: 'in-progress' });
    assert.deepEqual(resolveBoardDrop('todo', 'review'), { status: 'todo', column: 'todo' });
  });

  it('does not move scheduled tasks by drag/drop', () => {
    assert.equal(resolveBoardDrop('scheduled', 'review'), null);
  });
});
