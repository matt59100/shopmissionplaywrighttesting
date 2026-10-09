import fs from 'fs';
import path from 'path';
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';

type Options = {
  outputFolder?: string;
  maxRuns?: number;
  title?: string;
};

type Status = 'passed' | 'failed' | 'flaky' | 'skipped';

type Attempt = {
  status: string;
  duration: number;
  error?: { message: string; snippet?: string; location?: string };
  trace?: string;
  screenshots: string[];
  video?: string;
};

type TestEntry = {
  id: string;
  title: string;
  titlePath: string[];
  file: string;
  line: number;
  project: string;
  status: Status;
  duration: number;
  attempts: Attempt[];
};

type Run = {
  id: string;
  startedAt: string;
  duration: number;
  status: Status;
  stats: Record<Status, number>;
  ci?: { branch?: string; sha?: string; event?: string; url?: string };
  tests: TestEntry[];
};

type History = { title: string; runs: Run[] };

const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '');

class HistoryReporter implements Reporter {
  private readonly outputFolder: string;
  private readonly maxRuns: number;
  private readonly title: string;
  private rootDir = process.cwd();
  private startedAt = new Date();
  private readonly results = new Map<string, { test: TestCase; results: TestResult[] }>();

  constructor(options: Options = {}) {
    this.outputFolder = path.resolve(options.outputFolder ?? 'test-history');
    this.maxRuns = options.maxRuns ?? 5;
    this.title = options.title ?? 'Tests E2E';
  }

  printsToStdio() {
    return false;
  }

  onBegin(config: FullConfig, _suite: Suite) {
    this.rootDir = config.rootDir;
    this.startedAt = new Date();
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const entry = this.results.get(test.id) ?? { test, results: [] };
    entry.results.push(result);
    this.results.set(test.id, entry);
  }

  async onEnd(result: FullResult) {
    const runId = this.startedAt.toISOString().replace(/[:.]/g, '-');
    const runDir = path.join(this.outputFolder, 'runs', runId);
    fs.mkdirSync(runDir, { recursive: true });

    const tests: TestEntry[] = [];
    for (const { test, results } of this.results.values()) {
      const attempts = results.map((r, i) => this.toAttempt(test, r, i, runDir, runId));
      const last = results[results.length - 1];
      tests.push({
        id: test.id,
        title: test.title,
        titlePath: test.titlePath().slice(3, -1), // describe(s) uniquement
        file: path.relative(this.rootDir, test.location.file).replace(/\\/g, '/'),
        line: test.location.line,
        project: test.parent.project()?.name ?? '',
        status: this.toStatus(test),
        duration: last?.duration ?? 0,
        attempts,
      });
    }

    const stats: Record<Status, number> = { passed: 0, failed: 0, flaky: 0, skipped: 0 };
    for (const t of tests) stats[t.status]++;

    const run: Run = {
      id: runId,
      startedAt: this.startedAt.toISOString(),
      duration: result.duration,
      status: result.status === 'passed' ? (stats.flaky ? 'flaky' : 'passed') : 'failed',
      stats,
      ci: this.ciInfo(),
      tests,
    };

    const history = this.loadHistory();
    history.title = this.title;
    history.runs = [run, ...history.runs.filter(r => r.id !== run.id)].slice(0, this.maxRuns);
    this.pruneRuns(history);

    fs.writeFileSync(path.join(this.outputFolder, 'history.json'), JSON.stringify(history, null, 2));
    fs.writeFileSync(path.join(this.outputFolder, 'index.html'), renderHtml(history));
    // GitHub Pages : désactive Jekyll (sinon certains fichiers du trace viewer ne sont pas servis)
    fs.writeFileSync(path.join(this.outputFolder, '.nojekyll'), '');
    this.copyTraceViewer();

    console.log(`\nRapport d'historique : ${path.relative(process.cwd(), path.join(this.outputFolder, 'index.html'))}`);
  }

  private toStatus(test: TestCase): Status {
    switch (test.outcome()) {
      case 'expected': return 'passed';
      case 'flaky': return 'flaky';
      case 'skipped': return 'skipped';
      default: return 'failed';
    }
  }

  private toAttempt(test: TestCase, r: TestResult, index: number, runDir: string, runId: string): Attempt {
    const copy = (src: string, name: string) => {
      const dest = `${test.id}-${index}-${name}`;
      try {
        fs.copyFileSync(src, path.join(runDir, dest));
        return `runs/${runId}/${dest}`;
      } catch {
        return undefined;
      }
    };

    const attempt: Attempt = { status: r.status, duration: r.duration, screenshots: [] };
    for (const a of r.attachments) {
      if (!a.path) continue;
      if (a.name === 'trace') attempt.trace = copy(a.path, 'trace.zip');
      else if (a.contentType.startsWith('image/')) {
        const p = copy(a.path, `${attempt.screenshots.length}-${path.basename(a.path)}`);
        if (p) attempt.screenshots.push(p);
      } else if (a.contentType.startsWith('video/')) attempt.video = copy(a.path, path.basename(a.path));
    }

    const err = r.errors[0];
    if (err) {
      attempt.error = {
        message: stripAnsi(err.message ?? err.value ?? 'Erreur inconnue'),
        snippet: err.snippet ? stripAnsi(err.snippet) : undefined,
        location: err.location
          ? `${path.relative(this.rootDir, err.location.file).replace(/\\/g, '/')}:${err.location.line}`
          : undefined,
      };
    }
    return attempt;
  }

  private ciInfo(): Run['ci'] {
    const env = process.env;
    if (!env.GITHUB_ACTIONS) return undefined;
    return {
      branch: env.GITHUB_REF_NAME,
      sha: env.GITHUB_SHA?.slice(0, 7),
      event: env.GITHUB_EVENT_NAME,
      url: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
    };
  }

  private loadHistory(): History {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.outputFolder, 'history.json'), 'utf8'));
    } catch {
      return { title: this.title, runs: [] };
    }
  }

  // Supprime les dossiers des exécutions sorties de l'historique
  private pruneRuns(history: History) {
    const keep = new Set(history.runs.map(r => r.id));
    const runsDir = path.join(this.outputFolder, 'runs');
    for (const dir of fs.readdirSync(runsDir)) {
      if (!keep.has(dir)) fs.rmSync(path.join(runsDir, dir), { recursive: true, force: true });
    }
  }

  private copyTraceViewer() {
    const src = path.join(path.dirname(require.resolve('playwright-core/package.json')), 'lib', 'vite', 'traceViewer');
    const dest = path.join(this.outputFolder, 'trace-viewer');
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(src, dest, { recursive: true });
  }
}

function renderHtml(history: History): string {
  const data = JSON.stringify(history).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${history.title}</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22%3E%3Ccircle cx=%228%22 cy=%228%22 r=%227%22 fill=%22%233b5bdb%22/%3E%3C/svg%3E">
<style>${CSS}</style>
</head>
<body>
<div id="app"></div>
<div id="lightbox" hidden><img alt=""><button aria-label="Fermer">✕</button></div>
<script>window.__HISTORY__ = ${data};</script>
<script>${CLIENT_JS}</script>
</body>
</html>`;
}

const CSS = `
:root {
  --bg: #f6f7f9; --surface: #ffffff; --surface-2: #f0f2f5; --border: #e2e5ea;
  --text: #1a1d23; --muted: #646b78; --accent: #3b5bdb;
  --pass: #2b8a3e; --pass-bg: #e6f4ea; --fail: #c92a2a; --fail-bg: #fdecec;
  --flaky: #b35c00; --flaky-bg: #fff3e0; --skip: #868e96; --skip-bg: #f1f3f5;
  --code-bg: #f6f8fa; --shadow: 0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.08);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1115; --surface: #171a21; --surface-2: #1e222b; --border: #2a2f3a;
    --text: #e6e8ec; --muted: #9aa1ad; --accent: #7c95ff;
    --pass: #51cf66; --pass-bg: #1c2e22; --fail: #ff6b6b; --fail-bg: #3a1d1f;
    --flaky: #ffa94d; --flaky-bg: #3a2a17; --skip: #adb5bd; --skip-bg: #23272f;
    --code-bg: #12151b; --shadow: none;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.wrap { max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px; }
header { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; justify-content: space-between; margin-bottom: 20px; }
h1 { font-size: 22px; margin: 0; }
.sub { color: var(--muted); font-size: 13px; }
.sub a { color: var(--accent); }
.pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; font-weight: 600; font-size: 13px; }
.pill.passed { background: var(--pass-bg); color: var(--pass); }
.pill.failed { background: var(--fail-bg); color: var(--fail); }
.pill.flaky { background: var(--flaky-bg); color: var(--flaky); }
.pill.skipped { background: var(--skip-bg); color: var(--skip); }
h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 28px 0 10px; }
.runs { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
.run { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px; cursor: pointer; text-align: left; color: inherit; font: inherit; box-shadow: var(--shadow); }
.run:hover { border-color: var(--accent); }
.run[aria-pressed="true"] { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent) inset; }
.run .top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.run .date { font-weight: 600; }
.run .meta { color: var(--muted); font-size: 12px; margin-top: 2px; }
.bar { display: flex; height: 6px; border-radius: 3px; overflow: hidden; margin-top: 10px; background: var(--surface-2); }
.bar span.passed { background: var(--pass); } .bar span.failed { background: var(--fail); }
.bar span.flaky { background: var(--flaky); } .bar span.skipped { background: var(--skip); }
.dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex: none; }
.dot.passed { background: var(--pass); } .dot.failed { background: var(--fail); }
.dot.flaky { background: var(--flaky); } .dot.skipped { background: var(--skip); }
.dot.none { background: transparent; border: 1.5px dashed var(--border); }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; }
.kpi { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; box-shadow: var(--shadow); }
.kpi .v { font-size: 24px; font-weight: 700; font-variant-numeric: tabular-nums; }
.kpi .l { color: var(--muted); font-size: 12px; }
.kpi.failed .v { color: var(--fail); } .kpi.passed .v { color: var(--pass); } .kpi.flaky .v { color: var(--flaky); }
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 16px 0 10px; }
.chip { border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 999px; padding: 5px 12px; cursor: pointer; font: inherit; font-size: 13px; }
.chip[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
.search { flex: 1; min-width: 180px; padding: 7px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font: inherit; }
.tests { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; box-shadow: var(--shadow); }
.test + .test { border-top: 1px solid var(--border); }
.test > summary { list-style: none; display: grid; grid-template-columns: auto 1fr auto auto; gap: 12px; align-items: center; padding: 12px 14px; cursor: pointer; }
.test > summary::-webkit-details-marker { display: none; }
.test > summary:hover { background: var(--surface-2); }
.icon { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 700; }
.icon.passed { background: var(--pass-bg); color: var(--pass); } .icon.failed { background: var(--fail-bg); color: var(--fail); }
.icon.flaky { background: var(--flaky-bg); color: var(--flaky); } .icon.skipped { background: var(--skip-bg); color: var(--skip); }
.name { min-width: 0; }
.name .t { font-weight: 600; overflow-wrap: anywhere; }
.name .p { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.hist { display: flex; gap: 4px; align-items: center; }
.dur { color: var(--muted); font-variant-numeric: tabular-nums; font-size: 13px; min-width: 56px; text-align: right; }
.body { padding: 4px 14px 16px 48px; }
.attempt-tabs { display: flex; gap: 6px; margin: 4px 0 10px; flex-wrap: wrap; }
.err { background: var(--fail-bg); border-left: 3px solid var(--fail); border-radius: 6px; padding: 10px 12px; margin: 8px 0; }
.err .loc { font-size: 12px; color: var(--muted); margin-bottom: 4px; }
pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 12.5px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace; }
pre.snippet { background: var(--code-bg); border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; margin-top: 8px; overflow-x: auto; white-space: pre; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); text-decoration: none; font: inherit; font-size: 13px; cursor: pointer; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn:hover { filter: brightness(1.05); }
.shots { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
.shots img { width: 220px; max-width: 100%; border-radius: 6px; border: 1px solid var(--border); cursor: zoom-in; }
.note { color: var(--muted); font-size: 12px; margin-top: 8px; }
.note code { background: var(--code-bg); padding: 1px 5px; border-radius: 4px; }
.empty { padding: 32px; text-align: center; color: var(--muted); }
#lightbox { position: fixed; inset: 0; background: rgba(0,0,0,.8); display: grid; place-items: center; z-index: 10; padding: 16px; }
#lightbox[hidden] { display: none; }
#lightbox img { max-width: 100%; max-height: 100%; border-radius: 6px; }
#lightbox button { position: absolute; top: 12px; right: 12px; background: #fff; border: 0; border-radius: 50%; width: 36px; height: 36px; font-size: 16px; cursor: pointer; }
@media (max-width: 640px) {
  .test > summary { grid-template-columns: auto 1fr auto; }
  .test > summary .hist { display: none; }
  .body { padding-left: 14px; }
}
`;

const CLIENT_JS = `
(function () {
  var H = window.__HISTORY__;
  var LABEL = { passed: 'Réussi', failed: 'Échec', flaky: 'Instable', skipped: 'Ignoré' };
  var ICON = { passed: '✓', failed: '✕', flaky: '!', skipped: '–' };
  var ORDER = { failed: 0, flaky: 1, passed: 2, skipped: 3 };
  var state = { run: 0, filter: 'all', q: '', attempt: {} };
  var isFile = location.protocol === 'file:';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtDur(ms) {
    if (ms < 1000) return Math.round(ms) + ' ms';
    var s = ms / 1000;
    if (s < 60) return s.toFixed(1).replace('.', ',') + ' s';
    var m = Math.floor(s / 60); return m + ' min ' + String(Math.round(s % 60)).padStart(2, '0') + ' s';
  }
  function fmtDate(iso) { return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  function ago(iso) {
    var d = (Date.now() - new Date(iso)) / 1000;
    if (d < 60) return "à l'instant";
    if (d < 3600) return 'il y a ' + Math.floor(d / 60) + ' min';
    if (d < 86400) return 'il y a ' + Math.floor(d / 3600) + ' h';
    return 'il y a ' + Math.floor(d / 86400) + ' j';
  }
  function traceUrl(p) {
    var u = new URL('trace-viewer/index.html', location.href);
    u.searchParams.set('trace', new URL(p, location.href).href);
    return u.href;
  }
  function ciLine(run) {
    if (!run.ci) return 'Exécution locale';
    var parts = [];
    if (run.ci.branch) parts.push('branche ' + esc(run.ci.branch));
    if (run.ci.sha) parts.push('commit ' + esc(run.ci.sha));
    if (run.ci.event) parts.push(esc(run.ci.event));
    var txt = parts.join(' · ');
    return run.ci.url ? txt + ' · <a href="' + esc(run.ci.url) + '" target="_blank" rel="noopener">voir le job</a>' : txt;
  }

  function render() {
    var app = document.getElementById('app');
    if (!H.runs.length) { app.innerHTML = '<div class="wrap"><div class="empty">Aucune exécution enregistrée.</div></div>'; return; }
    var run = H.runs[state.run];
    var latest = H.runs[0];

    var html = '<div class="wrap">';
    html += '<header><div><h1>' + esc(H.title) + '</h1><div class="sub">Dernière exécution ' + ago(latest.startedAt) + ' · ' + ciLine(latest) + '</div></div>';
    html += '<span class="pill ' + latest.status + '">' + ICON[latest.status] + ' ' + (latest.status === 'passed' ? 'Tout est vert' : latest.status === 'flaky' ? 'Vert avec tests instables' : latest.stats.failed + ' test(s) en échec') + '</span></header>';

    html += '<h2>' + H.runs.length + ' dernière(s) exécution(s)</h2><div class="runs">';
    H.runs.forEach(function (r, i) {
      var total = r.tests.length || 1;
      html += '<button class="run" data-run="' + i + '" aria-pressed="' + (i === state.run) + '">';
      html += '<div class="top"><span class="date">' + fmtDate(r.startedAt) + '</span><span class="dot ' + r.status + '" title="' + LABEL[r.status] + '"></span></div>';
      html += '<div class="meta">' + r.stats.passed + '/' + r.tests.length + ' réussis · ' + fmtDur(r.duration) + (i === 0 ? ' · dernière' : '') + '</div>';
      html += '<div class="bar">' + ['passed', 'flaky', 'failed', 'skipped'].map(function (s) { return r.stats[s] ? '<span class="' + s + '" style="width:' + (r.stats[s] / total * 100) + '%"></span>' : ''; }).join('') + '</div>';
      html += '</button>';
    });
    html += '</div>';

    html += '<h2>Exécution du ' + fmtDate(run.startedAt) + '</h2><div class="sub" style="margin:-4px 0 10px">' + ciLine(run) + '</div>';
    html += '<div class="kpis">';
    html += '<div class="kpi"><div class="v">' + run.tests.length + '</div><div class="l">Tests</div></div>';
    html += '<div class="kpi passed"><div class="v">' + run.stats.passed + '</div><div class="l">Réussis</div></div>';
    html += '<div class="kpi failed"><div class="v">' + run.stats.failed + '</div><div class="l">Échecs</div></div>';
    html += '<div class="kpi flaky"><div class="v">' + run.stats.flaky + '</div><div class="l">Instables</div></div>';
    html += '<div class="kpi"><div class="v">' + fmtDur(run.duration) + '</div><div class="l">Durée</div></div>';
    html += '</div>';

    var filters = [['all', 'Tous'], ['failed', 'Échecs'], ['flaky', 'Instables'], ['passed', 'Réussis']];
    html += '<div class="toolbar">' + filters.map(function (f) {
      var n = f[0] === 'all' ? run.tests.length : run.stats[f[0]];
      return '<button class="chip" data-filter="' + f[0] + '" aria-pressed="' + (state.filter === f[0]) + '">' + f[1] + ' (' + n + ')</button>';
    }).join('') + '<input class="search" type="search" placeholder="Rechercher un test…" value="' + esc(state.q) + '"></div>';

    var q = state.q.toLowerCase();
    var tests = run.tests.filter(function (t) {
      if (state.filter !== 'all' && t.status !== state.filter) return false;
      return !q || (t.titlePath.concat(t.title, t.file).join(' ').toLowerCase().indexOf(q) !== -1);
    }).sort(function (a, b) { return ORDER[a.status] - ORDER[b.status] || a.file.localeCompare(b.file) || a.line - b.line; });

    html += '<div class="tests">';
    if (!tests.length) html += '<div class="empty">Aucun test ne correspond.</div>';
    tests.forEach(function (t) { html += renderTest(t, run); });
    html += '</div>';
    if (isFile) html += '<p class="note">Rapport ouvert en local (file://) : le trace viewer ne fonctionne qu\\'en HTTP. Lancez <code>npm run report</code> ou ouvrez la version publiée.</p>';
    html += '</div>';

    var open = Array.prototype.map.call(document.querySelectorAll('details.test[open]'), function (d) { return d.dataset.id; });
    app.innerHTML = html;
    open.forEach(function (id) { var d = document.querySelector('details.test[data-id="' + id + '"]'); if (d) d.open = true; });
  }

  function renderTest(t, run) {
    var hist = H.runs.slice().reverse().map(function (r) {
      var x = r.tests.find(function (y) { return y.id === t.id; });
      var s = x ? x.status : 'none';
      return '<span class="dot ' + s + '" title="' + fmtDate(r.startedAt) + ' : ' + (x ? LABEL[s] : 'non exécuté') + '"></span>';
    }).join('');

    var h = '<details class="test" data-id="' + esc(t.id) + '"' + (t.status === 'failed' && run.stats.failed <= 3 ? ' open' : '') + '>';
    h += '<summary><span class="icon ' + t.status + '" title="' + LABEL[t.status] + '">' + ICON[t.status] + '</span>';
    h += '<div class="name"><div class="t">' + esc(t.title) + '</div><div class="p">' + esc(t.titlePath.join(' › ')) + (t.titlePath.length ? ' · ' : '') + esc(t.file) + ':' + t.line + (t.project ? ' · ' + esc(t.project) : '') + '</div></div>';
    h += '<span class="hist" title="Historique (ancien → récent)">' + hist + '</span><span class="dur">' + fmtDur(t.duration) + '</span></summary>';

    var idx = state.attempt[t.id] != null ? state.attempt[t.id] : t.attempts.length - 1;
    var a = t.attempts[idx];
    h += '<div class="body">';
    if (t.attempts.length > 1) {
      h += '<div class="attempt-tabs">' + t.attempts.map(function (x, i) {
        return '<button class="chip" data-test="' + esc(t.id) + '" data-attempt="' + i + '" aria-pressed="' + (i === idx) + '">' + (i === 0 ? 'Essai initial' : 'Retry ' + i) + ' · ' + (x.status === 'passed' ? '✓' : '✕') + '</button>';
      }).join('') + '</div>';
    }
    if (a) {
      if (a.error) {
        h += '<div class="err">' + (a.error.location ? '<div class="loc">' + esc(a.error.location) + '</div>' : '') + '<pre>' + esc(a.error.message) + '</pre>';
        if (a.error.snippet) h += '<pre class="snippet">' + esc(a.error.snippet) + '</pre>';
        h += '</div>';
      }
      if (a.screenshots.length) {
        h += '<div class="shots">' + a.screenshots.map(function (s) { return '<img src="' + esc(s) + '" alt="Screenshot au moment de l\\'échec" loading="lazy">'; }).join('') + '</div>';
      }
      h += '<div class="actions">';
      if (a.trace) {
        h += isFile
          ? '<span class="btn" title="Disponible uniquement via HTTP">Trace (npm run report)</span>'
          : '<a class="btn primary" href="' + esc(traceUrl(a.trace)) + '" target="_blank" rel="noopener">Ouvrir la trace</a>';
        h += '<a class="btn" href="' + esc(a.trace) + '" download>Télécharger la trace</a>';
      }
      if (a.video) h += '<a class="btn" href="' + esc(a.video) + '" target="_blank" rel="noopener">Vidéo</a>';
      h += '</div>';
      if (!a.trace && !a.error && !a.screenshots.length) h += '<div class="note">Aucune pièce jointe pour ce test.</div>';
    }
    h += '</div></details>';
    return h;
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-run],[data-filter],[data-attempt],.shots img,#lightbox');
    if (!el) return;
    if (el.dataset.run != null) { state.run = +el.dataset.run; render(); }
    else if (el.dataset.filter) { state.filter = el.dataset.filter; render(); }
    else if (el.dataset.attempt != null) { state.attempt[el.dataset.test] = +el.dataset.attempt; render(); }
    else if (el.matches('.shots img')) { var lb = document.getElementById('lightbox'); lb.querySelector('img').src = el.src; lb.hidden = false; }
    else if (el.id === 'lightbox') { el.hidden = true; }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') document.getElementById('lightbox').hidden = true; });
  document.addEventListener('input', function (e) {
    if (!e.target.matches('.search')) return;
    state.q = e.target.value; render();
    var s = document.querySelector('.search'); s.focus(); s.setSelectionRange(s.value.length, s.value.length);
  });

  render();
})();
`;

export default HistoryReporter;
