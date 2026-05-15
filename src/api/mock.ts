/**
 * Mock implementations of the user-scoped works endpoints.
 *
 * Gated by the `USE_MOCK_USER_WORKS` flag in `../constants`. When that flag is `false`,
 * Rollup's tree-shaking removes this module from the production bundle (it's only
 * referenced behind a constant `if` guard via dynamic `import()` in `./client.ts`).
 *
 * Delete this file once the backend ships and the gates in `./client.ts` are removed.
 */

import type {
  ConfirmWorkVersionResponse,
  CreatorRequest,
  DownloadAssetResponse,
  DownloadCertificateResponse,
  InitWorkVersionResponse,
  InitWorkVersionUploadResponse,
  ListUserWorksResponse,
  ListWorkCreatorsResponse,
  ListWorkVersionsResponse,
  PrepareWorkVersionResponse,
  UserWork,
  WorkCreatorResponse,
  WorkVersionApi,
} from './types';

// ============================================
// Mock fixtures
// ============================================

const MOCK_LATENCY_MS = 600;
const MOCK_DOWNLOAD_LATENCY_MS = 400;

/** A real public mp3 sample so the asset download button visibly downloads something during demos. */
const MOCK_ASSET_URL = 'https://samplelib.com/lib/preview/mp3/sample-3s.mp3';

/** A real public PDF so the certificate download button visibly downloads something during demos. */
const MOCK_CERTIFICATE_URL = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

function isoPlusHour(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1);
  return d.toISOString();
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const MOCK_OWNER = '0x9c3a91e8f4b2a87e8a7f0e2c5d6a8b1c3e4f5a6b';

/** Pad an integer to a hex string of the given length (default 64 — a commitment hash). */
function hexHash(seed: number, length = 64): string {
  let s = '';
  for (let i = 0; i < length; i++) {
    s += (((seed * (i + 1) * 2654435761) >>> 0) & 0xf).toString(16);
  }
  return '0x' + s;
}

function isoFromSeed(daysOffset: number): string {
  const d = new Date('2024-01-15T10:00:00Z');
  d.setUTCDate(d.getUTCDate() + daysOffset);
  return d.toISOString();
}

interface MockSeed {
  title: string;
  filename?: string | null;
  hasFiles?: boolean;
}

const MOCK_SEEDS: MockSeed[] = [
  { title: 'Midnight Echo', filename: 'midnight-echo-master.mp3' },
  { title: 'Sunrise Sonata', filename: null, hasFiles: false },
  { title: 'Reverb Dreams', filename: 'reverb-dreams-final-v5.wav' },
  { title: 'Static Pulse', filename: 'static-pulse-demo.mp3' },
  { title: 'Ocean Drift', filename: 'ocean-drift-stereo-mix.flac' },
  { title: 'Velvet Storm', filename: 'velvet-storm-radio-edit.mp3' },
  { title: 'Neon Whisper', filename: 'neon-whisper.mp3' },
  { title: 'Iron Lullaby', filename: 'iron-lullaby-master.wav' },
  { title: 'Glass Mirage', filename: 'glass-mirage-instrumental.mp3' },
  { title: 'Crimson Tide', filename: 'crimson-tide-extended.flac' },
  { title: 'Aurora Frequency', filename: 'aurora-frequency.mp3' },
  { title: 'Steel Reverie', filename: 'steel-reverie-final.wav' },
  { title: 'Twilight Pulse', filename: 'twilight-pulse-master.mp3' },
  { title: 'Frost Cascade', filename: 'frost-cascade-rough-mix.mp3' },
  { title: 'Ember Sigh', filename: 'ember-sigh-acoustic.wav' },
  { title: 'Lunar Shift', filename: 'lunar-shift-radio.mp3' },
  { title: 'Crystal Hymn', filename: 'crystal-hymn-master.flac' },
  { title: 'Ash Symphony', filename: 'ash-symphony-orchestral.wav' },
  { title: 'Sapphire Drift', filename: 'sapphire-drift.mp3' },
  { title: 'Marble Echoes', filename: 'marble-echoes-demo.mp3' },
  { title: 'Vapor Trail', filename: 'vapor-trail-master.wav' },
  { title: 'Copper Reverb', filename: 'copper-reverb-instrumental.mp3' },
  { title: 'Indigo Wake', filename: 'indigo-wake-final.mp3' },
  { title: 'Onyx Bloom', filename: 'onyx-bloom-master.flac' },
  { title: 'Pearl Cipher', filename: 'pearl-cipher.mp3' },
];

/**
 * Inserts a `-v{n}` marker before a filename's extension so the demo visibly shows that
 * each version carries its own filename. The latest version keeps the unmarked base name.
 */
function versionedFilename(base: string, version: number, latestVersion: number): string {
  if (version === latestVersion) return base;
  const dot = base.lastIndexOf('.');
  if (dot < 0) return `${base}-v${version}`;
  return `${base.slice(0, dot)}-v${version}${base.slice(dot)}`;
}

/**
 * Synthesizes a chronologically-ordered version history for a single work.
 * v1 is registered at the work's `created_at`; each subsequent version is offset by ~7 days.
 * Fee structure mimics the dashboard reference: a 1460-credit deposit for v1 and 256-credit
 * updates thereafter, with no storage fee.
 */
function buildVersions(
  workSeed: number,
  baseCreatedAt: string,
  count: number,
  assetFilename: string | null,
): WorkVersionApi[] {
  const base = new Date(baseCreatedAt);
  const versions: WorkVersionApi[] = [];
  for (let v = 1; v <= count; v++) {
    const t = new Date(base);
    t.setUTCDate(t.getUTCDate() + (v - 1) * 7);
    t.setUTCHours(t.getUTCHours() + ((workSeed + v) % 6));
    t.setUTCMinutes(((workSeed * v * 13) % 60));
    const isV1 = v === 1;
    versions.push({
      version: v,
      commitment: hexHash(workSeed * 100 + v),
      asset_filename: assetFilename ? versionedFilename(assetFilename, v, count) : null,
      registered_at_block: 7000 + workSeed * 50 + v * 20,
      registered_at: t.toISOString(),
      media_hash: hexHash(workSeed * 400 + v),
      merkle_root: hexHash(workSeed * 500 + v),
      block_hash: hexHash(workSeed * 300 + v),
      tx_hash: hexHash(workSeed * 200 + v),
      fee_credits: isV1 ? 1460 : 256,
      storage_fee_credits: 0,
    });
  }
  return versions;
}

/** Generates a small synthetic creator list for a given (work, version) pair. */
function buildCreators(workSeed: number, version: number): WorkCreatorResponse[] {
  const baseName = ['Alex Rivera', 'Jordan Hale', 'Sam Okafor', 'Casey Lin', 'Morgan Ortega'][workSeed % 5];
  const altName = ['Taylor Park', 'Robin Chen', 'Drew Bennett', 'Sage Patel'][version % 4];
  const creators: WorkCreatorResponse[] = [
    {
      full_name: baseName,
      email: `${baseName.toLowerCase().replace(/\s+/g, '.')}@example.com`,
      roles: version === 1 ? ['Author', 'Composer'] : ['Composer'],
      ipi: '12345678901',
      isni: '0000000121234567',
    },
  ];
  if (version >= 2 || workSeed % 3 === 0) {
    creators.push({
      full_name: altName,
      email: `${altName.toLowerCase().replace(/\s+/g, '.')}@example.com`,
      roles: ['Author'],
    });
  }
  return creators;
}

interface MockWorkBundle {
  work: UserWork;
  versions: WorkVersionApi[];
  /** When set, the creators endpoint returns these regardless of version (overflow fixture). */
  creatorsOverride?: WorkCreatorResponse[];
}

const NORMAL_BUNDLES: MockWorkBundle[] = MOCK_SEEDS.map((seed, i) => {
  const seedNum = i + 1;
  const latestVersion = ((i * 3) % 5) + 1;
  const createdAt = isoFromSeed(i * 17 + 3);
  const assetFilename = seed.filename === undefined
    ? `${seed.title.toLowerCase().replace(/\s+/g, '-')}.mp3`
    : seed.filename;
  const versions = buildVersions(seedNum, createdAt, latestVersion, assetFilename);
  const latest = versions[versions.length - 1];
  const work: UserWork = {
    id: `550e8400-e29b-41d4-a716-44665544${String(i + 1).padStart(4, '0')}`,
    ats_id: 1042 + i * 13 + (i % 7),
    owner: MOCK_OWNER,
    latest_version: latestVersion,
    latest_commitment: latest.commitment,
    created_at: createdAt,
    updated_at: latest.registered_at ?? null,
    title: seed.title,
    asset_filename: assetFilename,
    has_files: seed.hasFiles !== false,
  };
  return { work, versions };
});

// ============================================
// Overflow stress-test fixture
// ============================================
//
// A deliberately oversized work, surfaced at the 2nd position of the list, used to verify
// that long titles / filenames / creator fields truncate or wrap gracefully everywhere.

/** Repeats `unit` until the result is exactly `length` characters long. */
function repeatToLength(unit: string, length: number): string {
  let s = '';
  while (s.length < length) s += unit;
  return s.slice(0, length);
}

const OVERFLOW_TITLE =
  'Overflow Stress Test Work With An Extremely Long Title That Far Exceeds The Two Hundred ' +
  'Character Display Limit In Order To Verify Ellipsis Truncation Wrapping And Layout Stability ' +
  'Across The Work Row The Detail Panel And The Version Header Components';

const OVERFLOW_FILENAME =
  'overflow-stress-test-an-unusually-long-original-asset-filename-that-should-truncate-' +
  'gracefully-on-the-download-button-and-in-every-detail-view-without-breaking-layout.wav';

/** Exactly the 255-char form maximum for a creator full name. */
const OVERFLOW_CREATOR_NAME = repeatToLength(
  'Aurelia Maximiliana Featherstonehaugh Bartholomew Higginbotham ', 255,
);

/** A long, structurally-valid email with no spaces — exercises `overflow-wrap` in the creators table. */
const OVERFLOW_CREATOR_EMAIL =
  'extremely.long.creator.email.address.used.purely.for.overflow.testing@' +
  'an-unusually-long-subdomain-name.example-domain-for-layout-tests.invalid';

/** Builds the overflow fixture with `updatedAt` chosen so it lands 2nd in the sorted list. */
function buildOverflowBundle(updatedAt: string): MockWorkBundle {
  const v2Date = updatedAt;
  const v1Date = new Date(new Date(updatedAt).getTime() - 9 * 24 * 3600_000).toISOString();
  const versions: WorkVersionApi[] = [
    {
      version: 1,
      commitment: hexHash(9001),
      asset_filename: versionedFilename(OVERFLOW_FILENAME, 1, 2),
      registered_at_block: 8021,
      registered_at: v1Date,
      media_hash: hexHash(9002),
      merkle_root: hexHash(9003),
      block_hash: hexHash(9004),
      tx_hash: hexHash(9005),
      fee_credits: 1460,
      storage_fee_credits: 0,
    },
    {
      version: 2,
      commitment: hexHash(9006),
      asset_filename: OVERFLOW_FILENAME,
      registered_at_block: 8062,
      registered_at: v2Date,
      media_hash: hexHash(9007),
      merkle_root: hexHash(9008),
      block_hash: hexHash(9009),
      tx_hash: hexHash(9010),
      fee_credits: 256,
      storage_fee_credits: 0,
    },
  ];
  const work: UserWork = {
    id: '550e8400-e29b-41d4-a716-4466554400ff',
    ats_id: 9999,
    owner: MOCK_OWNER,
    latest_version: 2,
    latest_commitment: versions[1].commitment,
    created_at: v1Date,
    updated_at: v2Date,
    title: OVERFLOW_TITLE,
    asset_filename: OVERFLOW_FILENAME,
    has_files: true,
  };
  const creatorsOverride: WorkCreatorResponse[] = [
    {
      full_name: OVERFLOW_CREATOR_NAME,
      email: OVERFLOW_CREATOR_EMAIL,
      roles: ['Author', 'Composer', 'Arranger', 'Adapter'],
      ipi: '12345678901',
      isni: '0000000121234567',
    },
    {
      full_name: 'Robin Okafor',
      email: 'robin.okafor@example.com',
      roles: ['Composer'],
      ipi: '98765432100',
      isni: '0000000463920512',
    },
  ];
  return { work, versions, creatorsOverride };
}

// Place the overflow work just below the newest normal work so it always renders 2nd.
const SORTED_NORMAL_DATES = NORMAL_BUNDLES
  .map(b => b.work.updated_at)
  .filter((d): d is string => d != null)
  .sort();
const NEWEST_NORMAL_UPDATED_AT = SORTED_NORMAL_DATES.length > 0
  ? SORTED_NORMAL_DATES[SORTED_NORMAL_DATES.length - 1]
  : new Date().toISOString();

const OVERFLOW_BUNDLE = buildOverflowBundle(
  new Date(new Date(NEWEST_NORMAL_UPDATED_AT).getTime() - 12 * 3600_000).toISOString(),
);

const MOCK_BUNDLES: MockWorkBundle[] = [...NORMAL_BUNDLES, OVERFLOW_BUNDLE];

const MOCK_WORKS: UserWork[] = MOCK_BUNDLES.map(b => b.work);
const MOCK_WORK_SEED: Record<string, number> = Object.fromEntries(
  MOCK_BUNDLES.map((b, i) => [b.work.id, i + 1]),
);

const MOCK_VERSIONS_BY_WORK = new Map<string, WorkVersionApi[]>(
  MOCK_BUNDLES.map(b => [b.work.id, b.versions]),
);

const MOCK_ATS_ID_BY_WORK = new Map<string, number>(
  MOCK_BUNDLES.map(b => [b.work.id, b.work.ats_id]),
);

const MOCK_CREATORS_OVERRIDE = new Map<string, WorkCreatorResponse[]>(
  MOCK_BUNDLES
    .filter((b): b is MockWorkBundle & { creatorsOverride: WorkCreatorResponse[] } => b.creatorsOverride != null)
    .map(b => [b.work.id, b.creatorsOverride]),
);

/** Compare ISO timestamps descending (newest first); nulls sink to the bottom. */
function compareUpdatedAtDesc(a: UserWork, b: UserWork): number {
  const av = a.updated_at ?? a.created_at;
  const bv = b.updated_at ?? b.created_at;
  if (av === bv) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  return av < bv ? 1 : -1;
}

// ============================================
// Listing mock
// ============================================

export async function listUserWorksMock(
  _atsUrl: string,
  _token: string,
  _siteKey: string,
  _externalUserId: string,
  opts: { network: string; first?: number; after?: string | null; search?: string | null },
): Promise<ListUserWorksResponse> {
  await delay(MOCK_LATENCY_MS);

  const search = (opts.search || '').toLowerCase();

  // Pretend every mock work lives on the requested network so demos always have data,
  // regardless of which network the host configured. The network is a query param —
  // the response shape itself doesn't echo it.
  let filtered = MOCK_WORKS.slice();
  if (search) {
    filtered = filtered.filter(w => (w.title || '').toLowerCase().includes(search));
  }
  filtered.sort(compareUpdatedAtDesc);

  return {
    works: filtered,
    page_info: {
      has_next_page: false,
      has_previous_page: false,
      start_cursor: null,
      end_cursor: null,
    },
    total_count: filtered.length,
  };
}

// ============================================
// Versions list mock
// ============================================

export async function listUserWorkVersionsMock(
  _atsUrl: string,
  _token: string,
  _siteKey: string,
  _externalUserId: string,
  workId: string,
): Promise<ListWorkVersionsResponse> {
  await delay(MOCK_LATENCY_MS);
  const versions = MOCK_VERSIONS_BY_WORK.get(workId) ?? [];
  const atsId = MOCK_ATS_ID_BY_WORK.get(workId) ?? -1;
  return { ats_id: atsId, versions };
}

// ============================================
// Creators mock (per-version)
// ============================================

export async function listUserWorkVersionCreatorsMock(
  _atsUrl: string,
  _token: string,
  _siteKey: string,
  _externalUserId: string,
  workId: string,
  version: number,
): Promise<ListWorkCreatorsResponse> {
  await delay(MOCK_LATENCY_MS);
  const atsId = MOCK_ATS_ID_BY_WORK.get(workId) ?? -1;
  const override = MOCK_CREATORS_OVERRIDE.get(workId);
  if (override) {
    return { ats_id: atsId, version, creators: override };
  }
  const seed = MOCK_WORK_SEED[workId] ?? 0;
  return {
    ats_id: atsId,
    version,
    creators: buildCreators(seed, version),
  };
}

// ============================================
// Download mocks (per-version)
// ============================================

export async function downloadUserWorkVersionAssetMock(
  _atsUrl: string,
  _token: string,
  _siteKey: string,
  _externalUserId: string,
  _workId: string,
  _version: number,
): Promise<DownloadAssetResponse> {
  await delay(MOCK_DOWNLOAD_LATENCY_MS);
  return { url: MOCK_ASSET_URL, expires_at: isoPlusHour() };
}

export async function downloadUserWorkVersionCertificateMock(
  _atsUrl: string,
  _token: string,
  _siteKey: string,
  _externalUserId: string,
  _workId: string,
  _version: number,
): Promise<DownloadCertificateResponse> {
  await delay(MOCK_DOWNLOAD_LATENCY_MS);
  return { url: MOCK_CERTIFICATE_URL, expires_at: isoPlusHour() };
}

// ============================================
// Version-update mocks
// ============================================
//
// These return stubs that exercise the existing UPLOAD / CONFIRMING / TRACKING screens
// up until the WebSocket/polling step. The WS URL is intentionally dead so the flow
// will end in FAILED — full end-to-end mock of tracking is out of scope for v1.

export async function initUserWorkVersionUploadMock(
  _atsUrl: string,
  _token: string,
  _siteKey: string,
  _externalUserId: string,
  _workId: string,
  data: { creators: CreatorRequest[]; filename: string },
): Promise<InitWorkVersionUploadResponse> {
  await delay(MOCK_LATENCY_MS);
  return {
    job_id: `mock-job-${Date.now()}`,
    upload_url: `https://mock-s3.example.com/upload/${encodeURIComponent(data.filename)}`,
    upload_expires_at: isoPlusHour(),
  };
}

export async function initUserWorkVersionMock(
  _atsUrl: string,
  _token: string,
  _siteKey: string,
  _externalUserId: string,
  _workId: string,
  _data: { creators: CreatorRequest[] },
): Promise<InitWorkVersionResponse> {
  await delay(MOCK_LATENCY_MS);
  return { job_id: `mock-job-${Date.now()}` };
}

export async function prepareUserWorkVersionMock(
  _atsUrl: string,
  _token: string,
  _siteKey: string,
  _externalUserId: string,
  _workId: string,
  data: { job_id: string },
): Promise<PrepareWorkVersionResponse> {
  await delay(MOCK_LATENCY_MS);
  return {
    job_id: data.job_id,
    commitment: '0xmockcommitment0000000000000000000000000000000000000000000000000000',
    version_deposit_credits: 100,
    network_fee_credits: 25,
    service_fee_credits: 10,
    storage_fee_credits: 0,
    total_price_credits: 135,
    is_valid: true,
    expires_at: isoPlusHour(),
  };
}

export async function confirmUserWorkVersionMock(
  _atsUrl: string,
  _token: string,
  _siteKey: string,
  _externalUserId: string,
  _workId: string,
  _data: { job_id: string },
): Promise<ConfirmWorkVersionResponse> {
  await delay(MOCK_LATENCY_MS);
  const txId = `mock-tx-${Date.now()}`;
  return {
    transaction_id: txId,
    // Dead WS / status URLs — will fail and surface a FAILED screen (documented v1 limitation).
    ws_url: `/v1/transactions/${txId}/ws`,
    status_url: `/v1/transactions/${txId}/status`,
  };
}
