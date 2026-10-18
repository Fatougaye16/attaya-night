// Watches a training log and reads the training loss out of it.
// Works with any text log where a line says something like `loss: 0.42`, `loss=0.42`,
// `'loss': 0.42` (Hugging Face) or `train_loss=0.42` (Lightning). Validation loss is ignored.

const fs = require('fs');

// `loss` not preceded by a word character, so `val_loss` and `eval_loss` don't match.
const LOSS = /(?:^|[^\w])(?:train[_ ])?loss['"]?\s*[:=]\s*['"]?(nan|[-+]?inf(?:inity)?|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)/i;
const DEFAULT_FINISH = 'training (?:complete|completed|finished|done)|finished training|train_runtime';
const MAX_POINTS = 300;
const INITIAL_READ_BYTES = 512 * 1024;
const POLL_MS = 1000;

const SPIKE_FACTOR = 1.5; // a value this many times the recent median is a spike
const PLATEAU_WINDOW = 20; // points per comparison window
const PLATEAU_GAIN = 0.01; // under 1% improvement between windows is a plateau

function parseLoss(line) {
  const m = LOSS.exec(line);
  if (!m) return undefined;
  const raw = m[1].toLowerCase();
  if (raw === 'nan') return NaN;
  if (raw.includes('inf')) return raw.startsWith('-') ? -Infinity : Infinity;
  const v = Number(raw);
  return Number.isNaN(v) ? undefined : v;
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// 'waiting' (no loss yet) | 'improving' | 'plateau' | 'spike' | 'nan'
function analyze(points) {
  if (!points.length) return 'waiting';
  const last = points[points.length - 1];
  if (!Number.isFinite(last)) return 'nan';
  const recent = points.slice(-PLATEAU_WINDOW - 1, -1).filter(Number.isFinite);
  if (recent.length >= 5) {
    const m = median(recent);
    if (m > 0 && last > m * SPIKE_FACTOR) return 'spike';
  }
  const finite = points.filter(Number.isFinite);
  if (finite.length >= PLATEAU_WINDOW * 2) {
    const prev = Math.min(...finite.slice(-PLATEAU_WINDOW * 2, -PLATEAU_WINDOW));
    const now = Math.min(...finite.slice(-PLATEAU_WINDOW));
    const gain = prev === 0 ? 0 : (prev - now) / Math.abs(prev);
    if (gain < PLATEAU_GAIN) return 'plateau';
  }
  return 'improving';
}

class TrainingWatcher {
  // onUpdate(event) is called with 'loss' after new points, 'finished' at the end of a run
  // and 'error' if the file can't be read.
  constructor(file, finishPattern, onUpdate) {
    this.file = file;
    this.onUpdate = onUpdate;
    this.points = [];
    this.finished = false;
    this.offset = 0;
    this.partial = '';
    this.lastError = '';
    try {
      this.finish = new RegExp(finishPattern || DEFAULT_FINISH, 'i');
    } catch (err) {
      this.finish = new RegExp(DEFAULT_FINISH, 'i');
    }
    this.readInitial();
    this.listener = () => this.readNew();
    fs.watchFile(this.file, { interval: POLL_MS }, this.listener);
  }

  // Start near the end of a big log; the first partial line is dropped.
  readInitial() {
    try {
      const { size } = fs.statSync(this.file);
      const start = Math.max(0, size - INITIAL_READ_BYTES);
      this.offset = start;
      this.readNew(start > 0);
    } catch (err) {
      this.fail(err);
    }
  }

  readNew(skipFirstLine = false) {
    let text;
    try {
      const { size } = fs.statSync(this.file);
      if (size < this.offset) {
        // The log was truncated or replaced: a new run.
        this.offset = 0;
        this.partial = '';
        this.points = [];
        this.finished = false;
      }
      if (size === this.offset) return;
      const fd = fs.openSync(this.file, 'r');
      try {
        const buf = Buffer.alloc(size - this.offset);
        fs.readSync(fd, buf, 0, buf.length, this.offset);
        text = buf.toString('utf8');
      } finally {
        fs.closeSync(fd);
      }
      this.offset = size;
      this.lastError = '';
    } catch (err) {
      this.fail(err);
      return;
    }
    const lines = (this.partial + text).split(/\r?\n/);
    this.partial = lines.pop();
    if (skipFirstLine) lines.shift();
    this.consume(lines);
  }

  consume(lines) {
    let added = false;
    let finished = false;
    for (const line of lines) {
      const v = parseLoss(line);
      if (v !== undefined) {
        this.points.push(v);
        added = true;
        this.finished = false;
      }
      if (this.finish.test(line)) finished = true;
    }
    if (this.points.length > MAX_POINTS) this.points = this.points.slice(-MAX_POINTS);
    if (added) this.onUpdate('loss');
    if (finished && !this.finished) {
      this.finished = true;
      this.onUpdate('finished');
    }
  }

  fail(err) {
    const message = err && err.code === 'ENOENT' ? 'The log file is missing.' : `Can't read the log (${err.message}).`;
    if (message === this.lastError) return;
    this.lastError = message;
    this.onUpdate('error');
  }

  status() {
    return this.finished ? 'finished' : analyze(this.points);
  }

  dispose() {
    fs.unwatchFile(this.file, this.listener);
  }
}

module.exports = { TrainingWatcher, parseLoss, analyze };
