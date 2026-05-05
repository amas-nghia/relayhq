import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_BOARD_LANE, getBoardLaneFromSearchParams, withBoardLane } from './boardLaneUrl';

describe('board lane URL state', () => {
  it('falls back to the default lane when the query is missing or invalid', () => {
    assert.equal(getBoardLaneFromSearchParams(new URLSearchParams()), DEFAULT_BOARD_LANE);
    assert.equal(getBoardLaneFromSearchParams(new URLSearchParams('lane=unknown')), DEFAULT_BOARD_LANE);
  });

  it('reads a valid lane from the query string', () => {
    assert.equal(getBoardLaneFromSearchParams(new URLSearchParams('lane=review')), 'review');
  });

  it('writes a non-default lane while preserving other query params', () => {
    const searchParams = withBoardLane(new URLSearchParams('project=alpha'), 'scheduled');

    assert.equal(searchParams.get('project'), 'alpha');
    assert.equal(searchParams.get('lane'), 'scheduled');
  });

  it('removes the lane param for the default lane', () => {
    const searchParams = withBoardLane(new URLSearchParams('project=alpha&lane=review'), DEFAULT_BOARD_LANE);

    assert.equal(searchParams.get('project'), 'alpha');
    assert.equal(searchParams.has('lane'), false);
  });
});
