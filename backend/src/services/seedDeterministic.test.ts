import fs from 'fs';
import path from 'path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const TEST_DB_PATH = path.join('/tmp', `stellar-goal-vault-seed-${process.pid}.db`);
process.env.DB_PATH = TEST_DB_PATH;

type DbModule = typeof import('./db');
type SeedModule = typeof import('./seedDeterministic');

let getDb: DbModule['getDb'];
let seedDeterministicState: SeedModule['seedDeterministicState'];

beforeAll(async () => {
  fs.rmSync(TEST_DB_PATH, { force: true });
  ({ getDb } = await import('./db'));
  ({ seedDeterministicState } = await import('./seedDeterministic'));
});

beforeEach(() => {
  seedDeterministicState();
});

describe('deterministic seed state', () => {
  it('produces stable campaign and pledge rows across repeated runs', () => {
    const db = getDb();
    const firstCampaigns = db
      .prepare(
        `SELECT id, creator, target_amount, pledged_amount, deadline, created_at, claimed_at
         FROM campaigns ORDER BY id ASC`,
      )
      .all();
    const firstPledges = db
      .prepare(`SELECT campaign_id, contributor, amount, created_at FROM pledges ORDER BY id ASC`)
      .all();

    seedDeterministicState();
    const secondCampaigns = db
      .prepare(
        `SELECT id, creator, target_amount, pledged_amount, deadline, created_at, claimed_at
         FROM campaigns ORDER BY id ASC`,
      )
      .all();
    const secondPledges = db
      .prepare(`SELECT campaign_id, contributor, amount, created_at FROM pledges ORDER BY id ASC`)
      .all();

    expect(secondCampaigns).toEqual(firstCampaigns);
    expect(secondPledges).toEqual(firstPledges);
  });

  it('clears campaign-owned state before reseeding', () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO campaign_comments (campaign_id, author, content, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run('1', `G${'F'.repeat(55)}`, 'stale comment', 1_750_000_100);
    db.prepare(
      `INSERT INTO notifications (campaign_id, type, title, body, target_wallet, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('1', 'new_pledge', 'stale notification', 'stale body', `G${'F'.repeat(55)}`, 1_750_000_100);
    db.prepare(
      `INSERT INTO webhook_dead_letter_queue (event, campaign_id, payload, failed_at, attempts)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('pledge.created', '1', '{}', 1_750_000_100, 1);

    seedDeterministicState();

    expect(db.prepare('SELECT COUNT(*) AS count FROM campaign_comments').get()).toEqual({ count: 0 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM notifications').get()).toEqual({ count: 0 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM webhook_dead_letter_queue').get()).toEqual({ count: 0 });
  });
});
