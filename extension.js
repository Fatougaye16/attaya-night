// Attaya Night: a little attaya teapot that keeps you company while you code.
// Moods: brewing (you're active), dozing (idle), boiling (errors pile up, tests fail, or a
// training loss spikes), nervous (the training loss has plateaued), reheating (the break
// between rounds), prayer (a prayer-time pause), fasting (Ramadan, until iftar) and pouring
// (something went well).
//
// A pot is three rounds: strong, steady, sweet. Between rounds the water reheats, and that
// break only counts down while you're away from the keyboard. The pot starts bitter and
// sweetens as good things happen, and each glass builds foam while you focus without
// interruption. At the end you get a summary card for the pot.

const vscode = require('vscode');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { TrainingWatcher } = require('./lib/training');
const { prayerTimes, isRamadan, validCoordinates } = require('./lib/prayer');

const POUR_MS = 3500;
const BOIL_MS = 4000;
const GREET_MS = 8000;
// Errors that vanish without a recent edit (file closed, language server restarted) aren't fixes.
const FIX_WINDOW_MS = 30 * 1000;
// During a break, you count as away after this long without touching the editor.
const AWAY_MS = 20 * 1000;
// A prayer time missed by more than this (the machine was asleep) is not announced late.
const PRAYER_LATE_MS = 30 * 60 * 1000;
const POT_KEY = 'attaya.pot';
const TRAINING_KEY = 'attaya.trainingFile';
const SAVE_EVERY_S = 15;
const HISTORY_DAYS = 91; // 13 weeks
const MAX_CARD_BYTES = 5 * 1024 * 1024;
const ROUND_NAMES = ['', 'strong', 'steady', 'sweet'];
const TEST_COMMAND = /\b(pytest|jest|vitest|mocha|unittest|npm (run )?test|yarn test|pnpm test|go test|cargo test)\b/;

// How much each event sweetens (or embitters) the pot, on a 0-100 scale.
const SUGAR = {
  start: 20,
  sipPerError: 3,
  maxSip: 9,
  task: 3,
  test: 8,
  recovery: 6, // extra, when tests go from failing to passing
  commit: 10,
  training: 10,
  boil: -6,
  testFail: -8,
};

// Foam builds on each glass while you focus without interruption. Glancing away for under
// 10 seconds is free; longer trips away from the editor, or dozing off, flatten it.
const FOAM = {
  rampSeconds: 600, // uninterrupted focus reaches the fastest build rate after 10 minutes
  glanceMs: 10 * 1000,
  glanceLoss: 10,
  awayMs: 30 * 1000,
  awayLoss: 25,
  idleLoss: 25,
};

// Teapots unlock by best-ever streak, so losing a streak never takes one away.
const TEAPOTS = [
  { id: 'classic', name: 'Sunset enamel', streak: 0 },
  { id: 'indigo', name: 'Indigo enamel', streak: 3 },
  { id: 'wonjo', name: 'Wonjo enamel', streak: 5 },
  { id: 'mint', name: 'Nana mint enamel', streak: 7 },
  { id: 'tiedye', name: 'Tie-dye', streak: 14 },
  { id: 'gold', name: 'Gold Tabaski pot', streak: 30 },
];

function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shiftDay(key, delta) {
  const [y, m, d] = key.split('-').map(Number);
  return todayKey(new Date(y, m - 1, d + delta));
}

function countErrors() {
  let n = 0;
  for (const [, diagnostics] of vscode.languages.getDiagnostics()) {
    for (const d of diagnostics) {
      if (d.severity === vscode.DiagnosticSeverity.Error) n++;
    }
  }
  return n;
}

function settings() {
  const c = vscode.workspace.getConfiguration('attaya');
  const ramadan = c.get('prayer.ramadanMode', 'auto');
  return {
    roundSeconds: Math.max(1, c.get('roundMinutes', 25)) * 60,
    breakSeconds: Math.max(1, c.get('breakMinutes', 5)) * 60,
    idleMs: Math.max(1, c.get('idleMinutes', 5)) * 60 * 1000,
    boilingThreshold: Math.max(1, c.get('boilingThreshold', 3)),
    showStatusBar: c.get('showStatusBar', true),
    language: c.get('language', 'english') === 'wolof' ? 'wolof' : 'english',
    sounds: c.get('sounds', false) === true,
    trainingFinishPattern: c.get('training.finishPattern', ''),
    prayer: {
      enabled: c.get('prayer.enabled', false) === true,
      latitude: c.get('prayer.latitude', null),
      longitude: c.get('prayer.longitude', null),
      method: c.get('prayer.method', 'MuslimWorldLeague'),
      madhab: c.get('prayer.madhab', 'shafi'),
      pauseSeconds: Math.max(1, c.get('prayer.pauseMinutes', 15)) * 60,
      ramadanMode: ['auto', 'on', 'off'].includes(ramadan) ? ramadan : 'auto',
    },
  };
}

function newPot() {
  return {
    day: todayKey(),
    round: 1,
    phase: 'round', // 'round' | 'break'
    remaining: settings().roundSeconds,
    breakRemaining: 0,
    paused: false,
    done: false,
    awaitingReturn: false,
    sugar: SUGAR.start,
    roundSugar: [], // sweetness each finished round ended on
    foam: 0,
    roundFoam: [], // foam each finished round ended with
    focusSeconds: 0,
    errorsSipped: 0,
    commits: 0,
    testsPassed: 0,
  };
}

// A saved pot is only resumed on the day it was last saved, and only if it looks sane.
function restorePot(saved) {
  if (!saved || typeof saved !== 'object' || saved.savedOn !== todayKey()) return null;
  if (!Number.isInteger(saved.round) || saved.round < 1 || saved.round > 3) return null;
  if (saved.phase !== 'round' && saved.phase !== 'break') return null;
  const num = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const counters = ['remaining', 'breakRemaining', 'sugar', 'focusSeconds', 'errorsSipped', 'commits', 'testsPassed'];
  if (!counters.every((k) => num(saved[k]))) return null;
  if (!Array.isArray(saved.roundSugar) || !saved.roundSugar.every(num)) return null;
  const s = settings();
  const pct = (v) => Math.min(100, v);
  const foamList = Array.isArray(saved.roundFoam) && saved.roundFoam.every(num) ? saved.roundFoam : [];
  return {
    ...newPot(),
    day: typeof saved.day === 'string' ? saved.day : todayKey(),
    round: saved.round,
    phase: saved.phase,
    remaining: Math.min(saved.remaining, s.roundSeconds),
    breakRemaining: Math.min(saved.breakRemaining, s.breakSeconds),
    paused: !!saved.paused,
    done: !!saved.done,
    awaitingReturn: !!saved.awaitingReturn,
    sugar: pct(saved.sugar),
    roundSugar: saved.roundSugar.slice(0, 3).map(pct),
    foam: num(saved.foam) ? pct(saved.foam) : 0,
    roundFoam: foamList.slice(0, 3).map(pct),
    focusSeconds: saved.focusSeconds,
    errorsSipped: saved.errorsSipped,
    commits: saved.commits,
    testsPassed: saved.testsPassed,
  };
}

// History used to store a plain glass count per day; it now stores a small record.
function normalizeHistory(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  for (const [day, v] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (typeof v === 'number') out[day] = { glasses: num(v), sipped: 0, longestFocus: 0, bestFoam: 0 };
    else if (v && typeof v === 'object') {
      out[day] = { glasses: num(v.glasses), sipped: num(v.sipped), longestFocus: num(v.longestFocus), bestFoam: num(v.bestFoam) };
    }
  }
  return out;
}

function clock(seconds) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function foamLabel(foam) {
  if (foam < 20) return 'flat';
  if (foam < 50) return 'light';
  if (foam < 80) return 'good';
  return 'thick';
}

function formatLoss(v) {
  if (v === undefined) return '';
  if (!Number.isFinite(v)) return Number.isNaN(v) ? 'NaN' : String(v);
  if (v !== 0 && Math.abs(v) < 0.001) return v.toExponential(2);
  return String(Number(v.toPrecision(4)));
}

class Attaya {
  constructor(context) {
    this.context = context;
    this.view = undefined;
    this.lastActivity = Date.now();
    this.lastEdit = 0;
    this.pouringUntil = 0;
    this.boilingUntil = 0;
    this.greetUntil = 0;
    this.flashLine = '';
    this.flashBig = false;
    this.testsFailing = false;
    this.errorCount = countErrors();

    this.windowFocused = vscode.window.state ? vscode.window.state.focused !== false : true;
    this.blurredAt = 0;
    this.focusRun = 0; // seconds of uninterrupted focus
    this.idleFlattened = false;

    // The pot lives in workspaceState so each window keeps its own through a reload.
    this.pot = restorePot(context.workspaceState.get(POT_KEY)) || newPot();

    this.stats = context.globalState.get('attaya.stats', { day: todayKey(), errorsSipped: 0, glasses: 0 });
    this.days = context.globalState.get('attaya.days', []);
    this.history = normalizeHistory(context.globalState.get('attaya.history', {}));
    if (!Object.keys(this.history).length && this.stats.day === todayKey() && this.stats.glasses > 0) {
      this.history = { [todayKey()]: { glasses: this.stats.glasses, sipped: this.stats.errorsSipped, longestFocus: 0, bestFoam: 0 } };
    }
    this.historyVersion = 0;
    this.historyCache = undefined;
    this.historyDirty = false;

    this.bestStreak = context.globalState.get('attaya.bestStreak', 0);
    this.teapot = context.globalState.get('attaya.teapot', 'classic');
    this.showReport = false;
    this.reportOffered = '';

    this.training = undefined;
    this.trainingStatus = 'waiting';

    this.lastPrayerCheck = Date.now();
    this.prayerCache = undefined;
    this.prayerPause = undefined;
    this.prayerWarned = false;

    this.statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusItem.command = 'attaya.show';
    context.subscriptions.push(this.statusItem);

    this.markActive();
    this.timer = setInterval(() => this.tick(), 1000);
    context.subscriptions.push({
      dispose: () => {
        clearInterval(this.timer);
        this.savePot();
        this.saveHistory();
        if (this.training) this.training.dispose();
      },
    });
  }

  // ---------- state ----------

  savePot() {
    this.context.workspaceState.update(POT_KEY, { ...this.pot, savedOn: todayKey() });
  }

  rollDay() {
    const key = todayKey();
    if (this.stats.day !== key) {
      this.stats = { day: key, errorsSipped: 0, glasses: 0 };
      this.saveStats();
    }
  }

  saveStats() {
    this.context.globalState.update('attaya.stats', this.stats);
  }

  // Change today's history record. Glasses and sips are saved straight away; focus
  // lengths change every second, so those wait for the next periodic save.
  updateToday(change, saveNow = true) {
    const key = todayKey();
    const day = this.history[key] || { glasses: 0, sipped: 0, longestFocus: 0, bestFoam: 0 };
    this.history = { ...this.history, [key]: change({ ...day }) };
    this.historyDirty = true;
    if (saveNow) this.saveHistory();
  }

  saveHistory() {
    if (!this.historyDirty) return;
    const cutoff = shiftDay(todayKey(), -HISTORY_DAYS);
    for (const day of Object.keys(this.history)) {
      if (day <= cutoff) delete this.history[day];
    }
    this.historyDirty = false;
    this.historyVersion++;
    this.context.globalState.update('attaya.history', this.history);
  }

  markEdit() {
    this.lastEdit = Date.now();
    this.markActive();
  }

  markActive() {
    const wasIdle = this.isIdle();
    const wasAwaiting = this.pot.awaitingReturn;
    this.lastActivity = Date.now();
    this.idleFlattened = false;
    this.pot.awaitingReturn = false;
    if (wasIdle) this.greetUntil = Date.now() + GREET_MS;
    const key = todayKey();
    if (!this.days.includes(key)) {
      this.days = [...this.days, key].slice(-HISTORY_DAYS);
      this.historyVersion++;
      this.context.globalState.update('attaya.days', this.days);
      this.checkUnlocks();
    }
    this.maybeOfferReport();
    if (wasAwaiting) this.savePot();
    if (wasIdle || wasAwaiting) this.render();
  }

  onWindowState(focused) {
    if (!focused) {
      this.windowFocused = false;
      this.blurredAt = Date.now();
      return;
    }
    const away = this.blurredAt ? Date.now() - this.blurredAt : 0;
    this.windowFocused = true;
    this.blurredAt = 0;
    if (away >= FOAM.awayMs) this.flattenFoam(FOAM.awayLoss);
    else if (away >= FOAM.glanceMs) this.flattenFoam(FOAM.glanceLoss);
    this.markActive();
  }

  flattenFoam(amount) {
    this.focusRun = 0;
    if (this.pot.phase === 'round' && !this.pot.done) this.pot.foam = Math.max(0, this.pot.foam - amount);
  }

  // Idle is tracked separately from mood: a boiling pot still dozes off and pauses the round.
  isIdle() {
    return Date.now() - this.lastActivity > settings().idleMs;
  }

  isAway() {
    return Date.now() - this.lastActivity > AWAY_MS;
  }

  streak() {
    const set = new Set(this.days);
    let key = todayKey();
    if (!set.has(key)) key = shiftDay(key, -1);
    let n = 0;
    while (set.has(key)) {
      n++;
      key = shiftDay(key, -1);
    }
    return n;
  }

  mood() {
    const now = Date.now();
    if (now < this.pouringUntil) return 'pouring';
    if (now < this.boilingUntil || this.errorCount >= settings().boilingThreshold) return 'boiling';
    if (this.training && this.trainingStatus === 'nan') return 'boiling';
    if (this.training && this.trainingStatus === 'plateau') return 'nervous';
    if (this.prayerPause) return 'prayer';
    if (this.pot.phase === 'break' && !this.pot.done) return 'reheating';
    if (this.fasting()) return 'fasting';
    // A healthy training run keeps the pot brewing even while you step away.
    if (this.training && this.trainingStatus === 'improving') return 'brewing';
    if (this.isIdle()) return 'dozing';
    return 'brewing';
  }

  // Sweetness belongs to the pot in progress; a finished pot's summary stays as it was.
  sweeten(delta) {
    if (this.pot.done) return;
    this.pot.sugar = Math.max(0, Math.min(100, this.pot.sugar + delta));
  }

  sound(name) {
    if (this.view && settings().sounds) this.view.webview.postMessage({ type: 'sound', name });
  }

  // ---------- events ----------

  pour(line, big = false) {
    this.rollDay();
    this.stats.glasses += 1;
    this.saveStats();
    this.updateToday((d) => ({ ...d, glasses: d.glasses + 1 }));
    this.boilingUntil = 0;
    this.pouringUntil = Date.now() + POUR_MS;
    this.flashLine = line;
    this.flashBig = big;
    this.sound('pour');
    this.render();
    setTimeout(() => this.render(), POUR_MS + 50);
  }

  boil(line) {
    this.pouringUntil = 0;
    this.boilingUntil = Date.now() + BOIL_MS;
    this.flashLine = line;
    this.flashBig = false;
    this.sound('rattle');
    this.render();
    setTimeout(() => this.render(), BOIL_MS + 50);
  }

  onDiagnostics() {
    const before = this.errorCount;
    const n = countErrors();
    const fixed = before - n;
    this.errorCount = n;
    if (fixed > 0 && Date.now() - this.lastEdit < FIX_WINDOW_MS) {
      this.rollDay();
      this.stats.errorsSipped += fixed;
      this.saveStats();
      this.updateToday((d) => ({ ...d, sipped: d.sipped + fixed }), false);
      if (!this.pot.done) this.pot.errorsSipped += fixed;
      this.sweeten(Math.min(SUGAR.maxSip, fixed * SUGAR.sipPerError));
      const s = this.stats.errorsSipped;
      this.pour(fixed === 1 ? `Error sipped. That's ${s} today.` : `${fixed} errors sipped. That's ${s} today.`, fixed >= 3);
      return;
    }
    const threshold = settings().boilingThreshold;
    if (before < threshold && n >= threshold) {
      this.sweeten(SUGAR.boil);
      this.sound('rattle');
    }
    this.render();
  }

  onTask(name) {
    this.sweeten(SUGAR.task);
    this.pour(`"${name}" finished clean.`);
  }

  onCommit() {
    if (!this.pot.done) this.pot.commits += 1;
    this.sweeten(SUGAR.commit);
    this.pour('Commit landed. Pour one for the repo.');
  }

  onTestRun(exitCode) {
    if (exitCode === 0) {
      const recovered = this.testsFailing;
      this.testsFailing = false;
      if (!this.pot.done) this.pot.testsPassed += 1;
      this.sweeten(SUGAR.test + (recovered ? SUGAR.recovery : 0));
      this.pour(recovered ? 'From bitter to sweet. The tests are green again.' : 'Tests passed. Sweet round.', recovered);
    } else if (exitCode < 128) {
      // 128 and above means the run was stopped by a signal (Ctrl+C on a watcher), not a failure.
      this.testsFailing = true;
      this.sweeten(SUGAR.testFail);
      this.boil('Tests failed. A bitter sip, but now you know where to look.');
    }
  }

  tick() {
    this.checkPrayer();
    const p = this.pot;
    if (p.done || p.paused) {
      this.render();
      return;
    }
    if (p.phase === 'break') {
      // The water only reheats while you're away from the keyboard.
      if (this.isAway()) {
        p.breakRemaining -= 1;
        if (p.breakRemaining <= 0) {
          this.startNextRound(false);
          return;
        }
        if (p.breakRemaining % SAVE_EVERY_S === 0) this.savePot();
      }
      this.render();
      return;
    }
    if (p.awaitingReturn || this.isIdle()) {
      if (this.isIdle() && !this.idleFlattened) {
        this.idleFlattened = true;
        this.flattenFoam(FOAM.idleLoss);
      }
      this.render();
      return;
    }
    p.remaining -= 1;
    p.focusSeconds += 1;
    if (this.windowFocused) this.buildFoam();
    if (p.remaining <= 0) {
      this.endRound();
      return;
    }
    if (p.remaining % SAVE_EVERY_S === 0) {
      this.savePot();
      this.saveHistory();
    }
    this.render();
  }

  // Foam builds faster the longer the uninterrupted stretch: half speed at first,
  // double speed after FOAM.rampSeconds. An unbroken round ends with thick foam.
  buildFoam() {
    this.focusRun += 1;
    const rate = Math.min(2, 0.5 + this.focusRun / FOAM.rampSeconds);
    this.pot.foam = Math.min(100, this.pot.foam + (100 / settings().roundSeconds) * rate);
    const run = this.focusRun;
    const today = this.history[todayKey()];
    if (!today || run > today.longestFocus) {
      this.updateToday((d) => ({ ...d, longestFocus: Math.max(d.longestFocus, run) }), false);
    }
  }

  endRound() {
    const p = this.pot;
    const done = p.round;
    p.roundSugar[done - 1] = p.sugar;
    p.roundFoam[done - 1] = p.foam;
    p.remaining = 0;
    const foam = p.foam;
    this.updateToday((d) => ({ ...d, bestFoam: Math.max(d.bestFoam, foam) }));
    const withFoam = `with ${foamLabel(foam)} foam`;
    if (done < 3) {
      p.phase = 'break';
      p.breakRemaining = settings().breakSeconds;
      p.foam = 0;
      this.focusRun = 0;
      this.savePot();
      this.pour(`Round ${done} poured ${withFoam}. Step away while the water reheats.`, true);
      const minutes = Math.round(p.breakRemaining / 60);
      vscode.window.showInformationMessage(
        `Attaya: round ${done} is done. Step away for ${minutes} minute${minutes === 1 ? '' : 's'} while the water reheats.`,
        'Skip the break',
      ).then((pick) => { if (pick) this.skipBreak(); });
    } else {
      p.done = true;
      this.savePot();
      this.pour(`Third round poured ${withFoam}. The pot is empty.`, true);
      vscode.window.showInformationMessage('Attaya: all three rounds done. Go take a real break.', 'Brew a fresh pot')
        .then((pick) => { if (pick) this.freshPot(); });
    }
  }

  // After a full break you're away, so the round waits for you; after a skip you're here.
  startNextRound(skipped) {
    const p = this.pot;
    if (p.phase !== 'break' || p.done) return;
    p.round += 1;
    p.phase = 'round';
    p.remaining = settings().roundSeconds;
    p.breakRemaining = 0;
    p.paused = false;
    p.awaitingReturn = !skipped;
    p.foam = 0;
    this.focusRun = 0;
    this.savePot();
    this.render();
    if (!skipped) {
      vscode.window.showInformationMessage(`Attaya: the water's hot again. Round ${p.round}, the ${ROUND_NAMES[p.round]} one, starts when you're back.`);
    }
  }

  skipBreak() {
    this.startNextRound(true);
  }

  toggleRound() {
    if (this.pot.done) {
      this.freshPot();
      return;
    }
    if (this.pot.phase === 'break') {
      this.skipBreak();
      return;
    }
    this.pot.paused = !this.pot.paused;
    if (!this.pot.paused) this.prayerPause = undefined;
    this.savePot();
    this.render();
  }

  freshPot() {
    this.pot = newPot();
    this.testsFailing = false;
    this.prayerPause = undefined;
    this.focusRun = 0;
    this.savePot();
    this.markActive();
    this.render();
  }

  // ---------- teapots ----------

  checkUnlocks() {
    const streak = this.streak();
    if (streak <= this.bestStreak) return;
    const before = this.bestStreak;
    this.bestStreak = streak;
    this.context.globalState.update('attaya.bestStreak', streak);
    const unlocked = TEAPOTS.filter((t) => t.streak > before && t.streak <= streak && t.streak > 0);
    for (const t of unlocked) {
      vscode.window.showInformationMessage(`Attaya: a ${streak}-day streak unlocked the ${t.name}.`, 'Use it')
        .then((pick) => { if (pick) this.chooseTeapot(t.id); });
    }
    if (unlocked.length) {
      this.sound('clink');
      this.pour(`New teapot unlocked: ${unlocked[unlocked.length - 1].name}.`, true);
    }
  }

  isUnlocked(id) {
    const t = TEAPOTS.find((x) => x.id === id);
    return !!t && t.streak <= Math.max(this.bestStreak, this.streak());
  }

  chooseTeapot(id) {
    if (!this.isUnlocked(id)) return;
    this.teapot = id;
    this.context.globalState.update('attaya.teapot', id);
    this.render();
  }

  async pickTeapot() {
    const items = TEAPOTS.map((t) => ({
      label: `${t.id === this.teapot ? '$(check) ' : ''}${t.name}`,
      description: this.isUnlocked(t.id) ? '' : `$(lock) ${t.streak}-day streak`,
      id: t.id,
    }));
    const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Choose your teapot' });
    if (!pick) return;
    if (this.isUnlocked(pick.id)) this.chooseTeapot(pick.id);
    else vscode.window.showInformationMessage(`Attaya: keep a ${TEAPOTS.find((t) => t.id === pick.id).streak}-day streak to unlock that one.`);
  }

  // ---------- weekly report ----------

  weeklyReport() {
    const today = todayKey();
    const active = new Set(this.days);
    const report = { from: shiftDay(today, -6), to: today, glasses: 0, sipped: 0, longestFocus: 0, bestFoam: 0, bestFoamDay: '', activeDays: 0, streak: this.streak() };
    for (let i = 6; i >= 0; i--) {
      const day = shiftDay(today, -i);
      const rec = this.history[day];
      if (active.has(day)) report.activeDays++;
      if (!rec) continue;
      report.glasses += rec.glasses;
      report.sipped += rec.sipped;
      report.longestFocus = Math.max(report.longestFocus, rec.longestFocus);
      if (rec.bestFoam > report.bestFoam) {
        report.bestFoam = rec.bestFoam;
        report.bestFoamDay = day;
      }
    }
    return report;
  }

  openReport() {
    this.saveHistory();
    this.showReport = true;
    this.render();
    vscode.commands.executeCommand('attaya.view.focus');
  }

  // Fridays, once a day, offer the weekly report.
  maybeOfferReport() {
    const today = todayKey();
    if (new Date().getDay() !== 5 || this.reportOffered === today) return;
    this.reportOffered = today;
    if (this.context.globalState.get('attaya.reportOffered') === today) return;
    this.context.globalState.update('attaya.reportOffered', today);
    vscode.window.showInformationMessage("Attaya: it's Friday. Your weekly glass report is ready.", 'Open it')
      .then((pick) => { if (pick) this.openReport(); });
  }

  // ---------- training runs ----------

  async pickTrainingLog() {
    const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Watch this log',
      defaultUri: folder ? folder.uri : undefined,
      filters: { 'Training logs': ['log', 'txt', 'out'], 'All files': ['*'] },
    });
    if (picked && picked[0]) this.watchTraining(picked[0].fsPath);
  }

  watchTraining(file) {
    this.stopTraining(false);
    let watcher;
    watcher = new TrainingWatcher(file, settings().trainingFinishPattern, (event) => this.onTraining(watcher, event));
    this.training = watcher;
    this.trainingStatus = watcher.status();
    this.context.workspaceState.update(TRAINING_KEY, file);
    this.render();
  }

  stopTraining(forget = true) {
    if (this.training) this.training.dispose();
    this.training = undefined;
    this.trainingStatus = 'waiting';
    if (forget) this.context.workspaceState.update(TRAINING_KEY, undefined);
    this.render();
  }

  onTraining(watcher, event) {
    // Events fired while the watcher reads the existing log arrive before it is assigned.
    if (!watcher || this.training !== watcher) return;
    const before = this.trainingStatus;
    const status = watcher.status();
    this.trainingStatus = status;
    const last = watcher.points[watcher.points.length - 1];
    if (event === 'finished') {
      this.sweeten(SUGAR.training);
      this.pour(`Training finished. Final loss ${formatLoss(last)}.`, true);
      vscode.window.showInformationMessage(`Attaya: training finished with a loss of ${formatLoss(last)}.`);
      return;
    }
    if (event === 'loss' && status !== before) {
      if (status === 'nan') {
        this.boil('Loss is NaN. The pot boiled over.');
        return;
      }
      if (status === 'spike') {
        this.boil(`Loss spiked to ${formatLoss(last)}.`);
        return;
      }
    }
    this.render();
  }

  trainingSnapshot() {
    const w = this.training;
    if (!w) return null;
    const finite = w.points.filter(Number.isFinite);
    return {
      file: path.basename(w.file),
      status: this.trainingStatus,
      error: w.lastError,
      count: w.points.length,
      latest: formatLoss(w.points[w.points.length - 1]),
      best: finite.length ? formatLoss(Math.min(...finite)) : '',
      // NaN and infinity don't survive postMessage as numbers; send them as null.
      points: w.points.slice(-120).map((v) => (Number.isFinite(v) ? v : null)),
    };
  }

  // ---------- prayer times ----------

  prayerConfig() {
    return settings().prayer;
  }

  todayPrayers() {
    const cfg = this.prayerConfig();
    if (!cfg.enabled) return [];
    const key = `${todayKey()}|${cfg.latitude}|${cfg.longitude}|${cfg.method}|${cfg.madhab}`;
    if (!this.prayerCache || this.prayerCache.key !== key) {
      let times = [];
      try {
        times = prayerTimes(cfg);
      } catch (err) {
        times = [];
      }
      this.prayerCache = { key, times };
    }
    return this.prayerCache.times;
  }

  ramadanActive() {
    const cfg = this.prayerConfig();
    if (!cfg.enabled || !validCoordinates(cfg.latitude, cfg.longitude)) return false;
    if (cfg.ramadanMode === 'on') return true;
    if (cfg.ramadanMode === 'off') return false;
    return isRamadan();
  }

  // During Ramadan the teapot rests from Fajr until Maghrib (iftar).
  fasting() {
    if (!this.ramadanActive()) return false;
    const times = this.todayPrayers();
    const fajr = times.find((t) => t.key === 'fajr');
    const maghrib = times.find((t) => t.key === 'maghrib');
    const now = Date.now();
    return !!fajr && !!maghrib && now >= fajr.time && now < maghrib.time;
  }

  warnMissingLocation() {
    const cfg = this.prayerConfig();
    if (!cfg.enabled || validCoordinates(cfg.latitude, cfg.longitude) || this.prayerWarned) return;
    this.prayerWarned = true;
    vscode.window.showWarningMessage('Attaya: prayer-time breaks need your latitude and longitude.', 'Open settings')
      .then((pick) => { if (pick) vscode.commands.executeCommand('workbench.action.openSettings', 'attaya.prayer'); });
  }

  checkPrayer() {
    const now = Date.now();
    if (this.prayerPause && now >= this.prayerPause.until) {
      if (this.pot.paused) this.pot.paused = false;
      this.prayerPause = undefined;
      this.savePot();
    }
    const since = this.lastPrayerCheck;
    this.lastPrayerCheck = now;
    const due = this.todayPrayers().filter((t) => t.time > since && t.time <= now && now - t.time < PRAYER_LATE_MS);
    if (due.length) this.startPrayer(due[due.length - 1]);
  }

  startPrayer(prayer) {
    const p = this.pot;
    const iftar = prayer.key === 'maghrib' && this.ramadanActive();
    if (p.phase === 'round' && !p.done && !p.paused) {
      p.paused = true;
      this.prayerPause = { name: prayer.name, until: Date.now() + this.prayerConfig().pauseSeconds * 1000 };
      this.savePot();
    }
    const resumeNote = this.prayerPause ? ' Your round is paused and will pick up again afterwards.' : '';
    if (iftar) {
      vscode.window.showInformationMessage(`Attaya: Maghrib. Iftar time.${resumeNote}`);
      this.pour('Iftar. The teapot is brewing again.', true);
      return;
    }
    vscode.window.showInformationMessage(`Attaya: it's time for ${prayer.name}.${resumeNote}`);
    this.render();
  }

  prayerSnapshot() {
    const cfg = this.prayerConfig();
    if (!cfg.enabled) return null;
    const times = this.todayPrayers();
    const now = Date.now();
    const next = times.find((t) => t.time > now);
    const maghrib = times.find((t) => t.key === 'maghrib');
    return {
      ready: times.length > 0,
      next: next ? { name: next.name, time: next.time } : null,
      pause: this.prayerPause ? { ...this.prayerPause } : null,
      fasting: this.fasting(),
      iftar: maghrib ? maghrib.time : null,
    };
  }

  // ---------- cards ----------

  async saveCard(msg) {
    let bytes;
    let ext;
    if (typeof msg.png === 'string' && msg.png.startsWith('data:image/png;base64,')) {
      bytes = Buffer.from(msg.png.slice('data:image/png;base64,'.length), 'base64');
      ext = 'png';
    } else if (typeof msg.svg === 'string' && msg.svg.startsWith('<svg')) {
      bytes = Buffer.from(msg.svg, 'utf8');
      ext = 'svg';
    } else {
      return;
    }
    if (bytes.length > MAX_CARD_BYTES) return;
    const name = msg.kind === 'week' ? `attaya-week-${todayKey()}` : `attaya-pot-${this.pot.day}`;
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(os.homedir(), `${name}.${ext}`)),
      filters: ext === 'png' ? { 'PNG image': ['png'] } : { 'SVG image': ['svg'] },
    });
    if (!uri) return;
    try {
      await vscode.workspace.fs.writeFile(uri, bytes);
      vscode.window.showInformationMessage(`Attaya: saved ${path.basename(uri.fsPath)}.`);
    } catch (err) {
      vscode.window.showErrorMessage(`Attaya: couldn't save the card (${err.message}).`);
    }
  }

  // ---------- rendering ----------

  // The last 13 weeks, oldest first, with the weekday of the first cell so the grid lines up.
  historyCells() {
    const today = todayKey();
    const key = `${today}:${this.historyVersion}`;
    if (this.historyCache && this.historyCache.key === key) return this.historyCache;
    const active = new Set(this.days);
    const cells = [];
    for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
      const day = shiftDay(today, -i);
      cells.push({ day, glasses: (this.history[day] || {}).glasses || 0, active: active.has(day) });
    }
    const [y, m, d] = cells[0].day.split('-').map(Number);
    this.historyCache = { key, offset: new Date(y, m - 1, d).getDay(), cells };
    return this.historyCache;
  }

  snapshot() {
    this.rollDay();
    const s = settings();
    const now = Date.now();
    const p = this.pot;
    const flashing = now < this.pouringUntil || now < this.boilingUntil;
    return {
      mood: this.mood(),
      idle: this.isIdle(),
      away: this.isAway(),
      greeting: now < this.greetUntil,
      phase: p.phase,
      round: p.round,
      remaining: p.remaining,
      roundSeconds: s.roundSeconds,
      breakRemaining: p.breakRemaining,
      paused: p.paused,
      done: p.done,
      awaitingReturn: p.awaitingReturn,
      sugar: p.sugar,
      roundSugar: p.roundSugar,
      foam: p.foam,
      roundFoam: p.roundFoam,
      pot: {
        day: p.day,
        focusSeconds: p.focusSeconds,
        errorsSipped: p.errorsSipped,
        commits: p.commits,
        testsPassed: p.testsPassed,
      },
      errorCount: this.errorCount,
      flashLine: flashing ? this.flashLine : '',
      flashBig: flashing && this.flashBig,
      streak: this.streak(),
      bestStreak: Math.max(this.bestStreak, this.streak()),
      errorsSipped: this.stats.errorsSipped,
      glasses: this.stats.glasses,
      history: this.historyCells(),
      language: s.language,
      teapot: this.isUnlocked(this.teapot) ? this.teapot : 'classic',
      teapots: TEAPOTS.map((t) => ({ ...t, unlocked: this.isUnlocked(t.id) })),
      report: this.showReport ? this.weeklyReport() : null,
      training: this.trainingSnapshot(),
      prayer: this.prayerSnapshot(),
    };
  }

  render() {
    const state = this.snapshot();

    if (settings().showStatusBar) {
      let text;
      if (state.done) text = '$(coffee) attaya · pot done';
      else if (this.prayerPause) text = `$(coffee) attaya · ${this.prayerPause.name} · round waiting`;
      else if (state.phase === 'break') text = `$(coffee) attaya · reheating · ${clock(state.breakRemaining)}`;
      else if (state.awaitingReturn) text = `$(coffee) attaya · round ${state.round} · ready`;
      else if (state.paused) text = `$(coffee) attaya · round ${state.round} · paused`;
      else if (state.idle) text = '$(coffee) attaya · dozing';
      else text = `$(coffee) attaya · round ${state.round} · ${clock(state.remaining)}`;
      if (state.training && state.training.latest) text += ` · loss ${state.training.latest}`;
      this.statusItem.text = text;
      this.statusItem.tooltip = 'Open the Attaya teapot';
      this.statusItem.show();
    } else {
      this.statusItem.hide();
    }

    if (this.view) this.view.webview.postMessage({ type: 'state', state });
  }
}

class AttayaViewProvider {
  constructor(context, attaya) {
    this.context = context;
    this.attaya = attaya;
  }

  resolveWebviewView(webviewView) {
    const mediaRoot = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    webviewView.webview.html = this.html(webviewView.webview);
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [mediaRoot] };
    this.attaya.view = webviewView;

    webviewView.webview.onDidReceiveMessage((msg) => {
      if (!msg || typeof msg !== 'object') return;
      const a = this.attaya;
      if (msg.type === 'ready') a.render();
      if (msg.type === 'toggleRound') a.toggleRound();
      if (msg.type === 'freshPot') a.freshPot();
      if (msg.type === 'saveCard') a.saveCard(msg);
      if (msg.type === 'chooseTeapot' && typeof msg.id === 'string') a.chooseTeapot(msg.id);
      if (msg.type === 'openReport') a.openReport();
      if (msg.type === 'closeReport') { a.showReport = false; a.render(); }
      if (msg.type === 'watchTraining') a.pickTrainingLog();
      if (msg.type === 'stopTraining') a.stopTraining();
    });
    webviewView.onDidChangeVisibility(() => { if (webviewView.visible) this.attaya.render(); });
    webviewView.onDidDispose(() => { if (this.attaya.view === webviewView) this.attaya.view = undefined; });
  }

  html(webview) {
    const media = (f) => webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', f));
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource}`,
      `script-src ${webview.cspSource}`,
      `img-src ${webview.cspSource} data:`,
    ].join('; ');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${media('view.css')}">
<title>Attaya</title>
</head>
<body>
<main class="attaya" data-mood="brewing">
  <div class="pot-stage" id="stage" role="img" aria-label="Attaya teapot"></div>
  <section class="mood">
    <p id="wolof" class="wolof" hidden></p>
    <h2 id="moodTitle">Brewing</h2>
    <p id="moodLine">You're in flow.</p>
  </section>
  <section class="rounds">
    <div class="rounds-head">
      <span id="roundLabel">ROUND 1 OF 3</span>
      <span id="timer" class="mono">25:00</span>
    </div>
    <div class="glasses" id="glasses"></div>
    <div class="sweetness">
      <span>Sweetness</span>
      <div class="meter" role="meter" id="sugarMeter" aria-label="Sweetness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="20"><div id="sugarFill"></div></div>
      <strong id="sugarLabel">Bitter</strong>
    </div>
    <div class="actions">
      <button id="toggle" type="button">Pause the round</button>
      <button id="fresh" type="button" class="ghost">Fresh pot</button>
    </div>
  </section>
  <section class="panel training" id="training" hidden>
    <div class="section-head"><span>TRAINING RUN</span><span id="trainingFile" class="mono"></span></div>
    <div class="training-status"><i id="trainingDot"></i><strong id="trainingStatus"></strong></div>
    <div id="spark" role="img" aria-label="Training loss"></div>
    <div class="training-numbers"><span>Latest <strong id="lossLatest" class="mono">–</strong></span><span>Best <strong id="lossBest" class="mono">–</strong></span><span><strong id="lossCount" class="mono">0</strong> points</span></div>
    <button id="stopTraining" type="button" class="ghost">Stop watching</button>
  </section>
  <section class="panel prayer" id="prayer" hidden>
    <div class="section-head"><span id="prayerHead">NEXT PRAYER</span><span id="prayerTime" class="mono"></span></div>
    <p id="prayerLine"></p>
  </section>
  <section class="summary" id="summary" hidden>
    <div id="card" role="img" aria-label="Summary of today's pot"></div>
    <button id="saveCard" type="button" class="ghost">Save as image</button>
  </section>
  <section class="summary" id="report" hidden>
    <div id="reportCard" role="img" aria-label="Weekly glass report"></div>
    <div class="actions">
      <button id="saveReport" type="button">Save as image</button>
      <button id="closeReport" type="button" class="ghost">Close</button>
    </div>
  </section>
  <section class="stats">
    <div><span>Streak</span><strong id="streak" class="sugar">0 days</strong></div>
    <div><span>Errors sipped today</span><strong id="sipped" class="mint">0</strong></div>
    <div><span>Glasses poured today</span><strong id="glassesPoured" class="wonjo">0</strong></div>
  </section>
  <section class="history">
    <div class="section-head"><span>LAST 13 WEEKS</span><span id="historyNote"></span></div>
    <div id="history" role="img" aria-label="Glasses poured per day"></div>
    <div class="legend" aria-hidden="true"><span>Fewer</span><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>More</span></div>
  </section>
  <section class="teapots">
    <div class="section-head"><span>TEAPOTS</span><span id="teapotNote"></span></div>
    <div class="teapot-grid" id="teapots"></div>
  </section>
  <section class="tools">
    <button id="openReport" type="button" class="ghost">Weekly report</button>
    <button id="watchTraining" type="button" class="ghost">Watch a training run</button>
  </section>
</main>
<script src="${media('pots.js')}"></script>
<script src="${media('sounds.js')}"></script>
<script src="${media('view.js')}"></script>
</body>
</html>`;
  }
}

async function watchCommits(attaya, context) {
  try {
    const ext = vscode.extensions.getExtension('vscode.git');
    if (!ext) return;
    const exports = ext.isActive ? ext.exports : await ext.activate();
    const api = exports.getAPI(1);
    const watch = (repo) => {
      let head = repo.state.HEAD;
      const sub = repo.state.onDidChange(() => {
        const next = repo.state.HEAD;
        if (head && next && head.commit && next.commit && head.commit !== next.commit && head.name === next.name) {
          const committed = next.ahead === undefined || head.ahead === undefined || next.ahead > head.ahead;
          if (committed) attaya.onCommit();
        }
        head = next;
      });
      context.subscriptions.push(sub);
    };
    api.repositories.forEach(watch);
    context.subscriptions.push(api.onDidOpenRepository(watch));
  } catch (err) {
    // Git isn't available; Attaya simply won't celebrate commits.
  }
}

function offerTheme(context) {
  if (context.globalState.get('attaya.offeredTheme')) return;
  context.globalState.update('attaya.offeredTheme', true);
  const current = vscode.workspace.getConfiguration('workbench').get('colorTheme');
  if (current === 'Attaya Night') return;
  vscode.window.showInformationMessage('Attaya is brewing. Want to switch to the Attaya Night theme too?', 'Use Attaya Night', 'Not now')
    .then((pick) => {
      if (pick === 'Use Attaya Night') {
        vscode.workspace.getConfiguration('workbench').update('colorTheme', 'Attaya Night', vscode.ConfigurationTarget.Global);
      }
    });
}

function activate(context) {
  const attaya = new Attaya(context);
  const provider = new AttayaViewProvider(context, attaya);

  context.subscriptions.push(
    // Kept alive while hidden so the teapot can still play sounds behind other views.
    vscode.window.registerWebviewViewProvider('attaya.view', provider, { webviewOptions: { retainContextWhenHidden: true } }),

    vscode.workspace.onDidChangeTextDocument((e) => {
      const scheme = e.document.uri.scheme;
      if ((scheme === 'file' || scheme === 'untitled' || scheme === 'vscode-notebook-cell') && e.contentChanges.length) {
        attaya.markEdit();
      }
    }),
    vscode.window.onDidChangeTextEditorSelection(() => attaya.markActive()),
    vscode.window.onDidChangeWindowState((s) => attaya.onWindowState(s.focused)),
    vscode.languages.onDidChangeDiagnostics(() => attaya.onDiagnostics()),
    vscode.tasks.onDidEndTaskProcess((e) => {
      if (e.exitCode === 0) attaya.onTask(e.execution.task.name);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('attaya')) return;
      if (e.affectsConfiguration('attaya.prayer')) {
        attaya.prayerWarned = false;
        attaya.warnMissingLocation();
      }
      attaya.render();
    }),

    vscode.commands.registerCommand('attaya.toggleRound', () => attaya.toggleRound()),
    vscode.commands.registerCommand('attaya.skipBreak', () => attaya.skipBreak()),
    vscode.commands.registerCommand('attaya.freshPot', () => attaya.freshPot()),
    vscode.commands.registerCommand('attaya.show', () => vscode.commands.executeCommand('attaya.view.focus')),
    vscode.commands.registerCommand('attaya.chooseTeapot', () => attaya.pickTeapot()),
    vscode.commands.registerCommand('attaya.weeklyReport', () => attaya.openReport()),
    vscode.commands.registerCommand('attaya.watchTraining', () => attaya.pickTrainingLog()),
    vscode.commands.registerCommand('attaya.stopTraining', () => attaya.stopTraining()),
  );

  // Only when running from source (F5): set the best streak to try the teapot unlocks.
  if (context.extensionMode === vscode.ExtensionMode.Development) {
    vscode.commands.executeCommand('setContext', 'attaya.devMode', true);
    context.subscriptions.push(vscode.commands.registerCommand('attaya.devSetBestStreak', async () => {
      const value = await vscode.window.showInputBox({ prompt: 'Best streak, in days', value: '30', validateInput: (v) => (/^\d+$/.test(v) ? undefined : 'A whole number') });
      if (value === undefined) return;
      attaya.bestStreak = 0;
      context.globalState.update('attaya.bestStreak', 0);
      const days = Number(value);
      attaya.days = Array.from({ length: days }, (_, i) => shiftDay(todayKey(), i - days + 1));
      context.globalState.update('attaya.days', attaya.days);
      attaya.historyVersion++;
      attaya.checkUnlocks();
      attaya.render();
    }));
  }

  // Test runs in the terminal (needs shell integration, VS Code 1.93+).
  if (typeof vscode.window.onDidEndTerminalShellExecution === 'function') {
    context.subscriptions.push(
      vscode.window.onDidEndTerminalShellExecution((e) => {
        const cmd = e.execution && e.execution.commandLine ? e.execution.commandLine.value : '';
        if (typeof e.exitCode === 'number' && TEST_COMMAND.test(cmd)) attaya.onTestRun(e.exitCode);
      }),
    );
  }

  // Pick up the training run this workspace was watching before a reload.
  const trainingFile = context.workspaceState.get(TRAINING_KEY);
  if (typeof trainingFile === 'string' && fs.existsSync(trainingFile)) attaya.watchTraining(trainingFile);

  attaya.warnMissingLocation();
  watchCommits(attaya, context);
  offerTheme(context);
  attaya.render();
}

function deactivate() {}

module.exports = { activate, deactivate };
