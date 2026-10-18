// Renders the Attaya sidebar from state sent by the extension.
// Teapot art lives in pots.js (window.AttayaPots), sounds in sounds.js (window.AttayaSounds).
(function () {
  const vscode = acquireVsCodeApi();
  const Pots = window.AttayaPots;
  const Sounds = window.AttayaSounds;

  const TITLES = {
    brewing: 'Brewing',
    dozing: 'Dozing',
    boiling: 'Boiling over',
    nervous: 'Nervous',
    reheating: 'Reheating',
    prayer: 'Prayer time',
    fasting: 'Fasting',
    pouring: 'Pouring',
  };
  const ROUND_NAMES = ['Strong', 'Steady', 'Sweet'];
  const ARIA = {
    brewing: 'Attaya teapot, brewing and smiling',
    dozing: 'Attaya teapot, asleep with its lid tilted',
    boiling: 'Attaya teapot, worried and bubbling over',
    nervous: 'Attaya teapot, glancing sideways and sweating',
    reheating: 'Attaya teapot, resting calmly on a charcoal stove',
    prayer: 'Attaya teapot, eyes closed under a crescent moon',
    fasting: 'Attaya teapot, resting with an upturned glass beside it',
    pouring: 'Attaya teapot, happily pouring a glass of tea',
  };

  // Shown above the mood title when attaya.language is "wolof", with the English on hover.
  // Waaw and Jàmm rekk confirmed by a Wolof speaker; have one check the rest before release.
  const WOLOF = {
    greeting: ['Nanga def?', 'How are you?'],
    bigPour: ['Waaw!', 'Yes!'],
    pouring: ['Neex na!', "That's sweet!"],
    calm: ['Jàmm rekk', "I'm doing good"],
    boiling: ['Muñal', 'Be patient'],
    reheating: ['Ndank ndank', 'Slowly, slowly'],
    done: ['Ba beneen yoon', 'Until next time'],
  };

  // Bitter tea is dark and brick red; sweet tea is a lighter amber.
  const BITTER = [0x6e, 0x2e, 0x0e];
  const SWEET = [0xe0, 0xa0, 0x4a];
  function teaColor(sugar) {
    const t = Math.max(0, Math.min(1, sugar / 100));
    return '#' + BITTER.map((v, i) => Math.round(v + (SWEET[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }

  function sugarLabel(sugar) {
    if (sugar < 30) return 'Bitter';
    if (sugar < 60) return 'Balanced';
    if (sugar < 85) return 'Sweet';
    return 'Very sweet';
  }

  function foamLabel(foam) {
    if (foam < 20) return 'Flat';
    if (foam < 50) return 'Light';
    if (foam < 80) return 'Good';
    return 'Thick';
  }

  function clock(seconds) {
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function dayLabel(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function weekdayLabel(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short' });
  }

  function timeLabel(ms) {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function durationLabel(ms) {
    const minutes = Math.max(0, Math.round(ms / 60000));
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h ? `${h}h ${m}m` : `${m}m`;
  }

  // The inside of a tapered attaya glass (32x40 box): tea filled to `fraction`, topped with
  // a band of foam whose thickness follows `foam` (0 to 100).
  function glassShape(fraction, state, color, foam = 0) {
    const top = 6;
    const bottom = 37;
    const xAt = (y) => [4 + (y - 4) * (3 / 34), 28 - (y - 4) * (3 / 34)];
    let tea = '';
    if (fraction > 0) {
      const head = fraction >= 1 ? 1.2 + (Math.min(100, foam) / 100) * 5.5 : 0;
      const y = bottom - (bottom - top - head) * Math.min(1, fraction);
      const [l, r] = xAt(y);
      const [bl, br] = xAt(bottom);
      tea = `<path d="M${l.toFixed(1)} ${y.toFixed(1)} L${r.toFixed(1)} ${y.toFixed(1)} L${br.toFixed(1)} ${bottom} L${bl.toFixed(1)} ${bottom} Z" fill="${color}"/>`;
      if (head > 0) {
        const fy = y - head;
        const [fl, fr] = xAt(fy);
        tea += `<path d="M${fl.toFixed(1)} ${fy.toFixed(1)} L${fr.toFixed(1)} ${fy.toFixed(1)} L${r.toFixed(1)} ${y.toFixed(1)} L${l.toFixed(1)} ${y.toFixed(1)} Z" fill="#F4E2C4"/>
          <ellipse cx="16" cy="${fy.toFixed(1)}" rx="${((fr - fl) / 2).toFixed(1)}" ry="1.8" fill="#FBF1DE"/>`;
      } else {
        tea += `<ellipse cx="16" cy="${y.toFixed(1)}" rx="${((r - l) / 2).toFixed(1)}" ry="2.2" fill="#F4E2C4"/>`;
      }
    }
    const stroke = state === 'current' ? '#E8833A' : '#5C6182';
    const dash = state === 'future' ? ' stroke-dasharray="3 3"' : '';
    return `${tea}<path d="M4 4 L28 4 L25 38 L7 38 Z" fill="none" stroke="${stroke}" stroke-width="1.5"${dash}/>`;
  }

  function glass(fraction, state, color, foam) {
    return `<svg viewBox="0 0 32 40" aria-hidden="true">${glassShape(fraction, state, color, foam)}</svg>`;
  }

  // ---------- cards ----------

  const CARD_W = 320;
  const CARD_H = 232;
  const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif";

  function cardFrame(title, right, content) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}" font-family="${FONT}">
  <rect x="0.5" y="0.5" width="${CARD_W - 1}" height="${CARD_H - 1}" rx="16" fill="#12141F" stroke="#2A2E45"/>
  <text x="20" y="30" fill="#8A8FAD" font-size="11" font-weight="600" letter-spacing="1.2">${title}</text>
  <text x="${CARD_W - 20}" y="30" fill="#8A8FAD" font-size="11" text-anchor="end">${right}</text>
  ${content}
  <text x="20" y="${CARD_H - 16}" fill="#5C6182" font-size="10">Attaya Night</text>
</svg>`;
  }

  function stat(x, y, label, value, color) {
    return `<text x="${x}" y="${y}" fill="#8A8FAD" font-size="11">${label}</text>
       <text x="${x}" y="${y + 21}" fill="${color}" font-size="18" font-weight="700">${value}</text>`;
  }

  function potCardSvg(s) {
    const p = s.pot;
    const glasses = [0, 1, 2].map((i) => {
      const sugar = s.roundSugar[i] !== undefined ? s.roundSugar[i] : s.sugar;
      const foam = s.roundFoam[i] !== undefined ? s.roundFoam[i] : 0;
      return `<svg x="${20 + i * 34}" y="44" width="28" height="36" viewBox="0 0 32 40">${glassShape(1, 'done', teaColor(sugar), foam)}</svg>`;
    }).join('');
    const bestFoam = s.roundFoam.length ? Math.max(...s.roundFoam) : 0;
    return cardFrame("TODAY'S POT", dayLabel(p.day), `${glasses}
  <text x="136" y="58" fill="#8A8FAD" font-size="11">Sweetness</text>
  <text x="136" y="80" fill="#F2C14E" font-size="20" font-weight="800">${sugarLabel(s.sugar)}</text>
  ${stat(20, 118, 'Focus', `${Math.round(p.focusSeconds / 60)} min`, '#D9D4C7')}
  ${stat(120, 118, 'Errors sipped', p.errorsSipped, '#8FC9A3')}
  ${stat(220, 118, 'Commits', p.commits, '#E8833A')}
  ${stat(20, 166, 'Tests passed', p.testsPassed, '#7FA7E8')}
  ${stat(120, 166, 'Streak', s.streak === 1 ? '1 day' : `${s.streak} days`, '#F2C14E')}
  ${stat(220, 166, 'Best foam', foamLabel(bestFoam), '#F4E2C4')}`);
  }

  function weekCardSvg(r) {
    const best = r.bestFoamDay ? `${foamLabel(r.bestFoam)}, ${weekdayLabel(r.bestFoamDay)}` : '–';
    return cardFrame('THIS WEEK', `${dayLabel(r.from)} – ${dayLabel(r.to)}`, `
  <text x="20" y="72" fill="#F2C14E" font-size="34" font-weight="800">${r.glasses}</text>
  <text x="20" y="90" fill="#8A8FAD" font-size="11">glasses poured</text>
  <text x="170" y="72" fill="#8FC9A3" font-size="34" font-weight="800">${r.sipped}</text>
  <text x="170" y="90" fill="#8A8FAD" font-size="11">errors sipped</text>
  ${stat(20, 128, 'Longest focus', `${Math.round(r.longestFocus / 60)} min`, '#D9D4C7')}
  ${stat(170, 128, 'Best round', best, '#F4E2C4')}
  ${stat(20, 172, 'Days at the pot', `${r.activeDays} of 7`, '#E8833A')}
  ${stat(170, 172, 'Streak', r.streak === 1 ? '1 day' : `${r.streak} days`, '#E86A92')}`);
  }

  // Draw a card onto a canvas for a PNG; fall back to the SVG if the canvas can't export.
  function exportCard(svg, kind) {
    const scale = 2;
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = CARD_W * scale;
        canvas.height = CARD_H * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        vscode.postMessage({ type: 'saveCard', kind, png: canvas.toDataURL('image/png') });
      } catch (err) {
        vscode.postMessage({ type: 'saveCard', kind, svg });
      }
    };
    img.onerror = () => vscode.postMessage({ type: 'saveCard', kind, svg });
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // ---------- history grid ----------

  function level(cell) {
    if (cell.glasses === 0) return cell.active ? 1 : 0;
    if (cell.glasses <= 2) return 2;
    if (cell.glasses <= 5) return 3;
    return 4;
  }

  function historySvg(h) {
    const size = 12;
    const gap = 3;
    const step = size + gap;
    const cols = Math.ceil((h.cells.length + h.offset) / 7);
    const last = h.cells.length - 1;
    const rects = h.cells.map((cell, i) => {
      const idx = i + h.offset;
      const x = Math.floor(idx / 7) * step;
      const y = (idx % 7) * step;
      const n = cell.glasses;
      const label = `${dayLabel(cell.day)}: ${n === 1 ? '1 glass' : `${n} glasses`}${cell.active && n === 0 ? ' (coded, nothing poured)' : ''}`;
      return `<rect class="l${level(cell)}${i === last ? ' today' : ''}" x="${x}" y="${y}" width="${size}" height="${size}" rx="3"><title>${label}</title></rect>`;
    }).join('');
    return `<svg viewBox="0 0 ${cols * step - gap} ${7 * step - gap}">${rects}</svg>`;
  }

  // ---------- training sparkline ----------

  const TRAINING_STATUS = {
    waiting: ['Waiting for the first loss…', 'muted'],
    improving: ['Loss going down', 'good'],
    plateau: ['Plateau', 'warn'],
    spike: ['Spike', 'bad'],
    nan: ['NaN loss', 'bad'],
    finished: ['Finished', 'done'],
  };

  // One series: a 2px mint line, the latest point marked, NaN/inf as warning ticks along the top.
  // Log scale when the loss spans more than 20x, which training curves usually do.
  function sparkSvg(points, status) {
    const W = 260;
    const H = 56;
    const pad = 5;
    const finite = points.filter((v) => v !== null);
    if (!points.length) return `<svg viewBox="0 0 ${W} ${H}"></svg>`;
    const min = finite.length ? Math.min(...finite) : 0;
    const max = finite.length ? Math.max(...finite) : 1;
    const useLog = min > 0 && max / min > 20;
    const f = (v) => (useLog ? Math.log10(v) : v);
    const lo = f(min);
    const hi = f(max) === lo ? lo + 1 : f(max);
    const n = points.length;
    const x = (i) => pad + (n === 1 ? (W - 2 * pad) / 2 : (i / (n - 1)) * (W - 2 * pad));
    const y = (v) => pad + 4 + (1 - (f(v) - lo) / (hi - lo)) * (H - 2 * pad - 4);

    let d = '';
    let pen = false;
    const ticks = [];
    points.forEach((v, i) => {
      if (v === null) {
        pen = false;
        ticks.push(i);
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      pen = true;
    });
    const step = (W - 2 * pad) / Math.max(1, n - 1);
    const hits = points.map((v, i) => `<rect x="${(x(i) - step / 2).toFixed(1)}" y="0" width="${Math.max(2, step).toFixed(1)}" height="${H}" fill="transparent"><title>Point ${i + 1}: ${v === null ? 'NaN' : v}</title></rect>`).join('');
    const nanMarks = ticks.map((i) => `<path d="M${x(i).toFixed(1)} 1 l-3.5 6 h7 Z" fill="#E86A92"/>`).join('');
    let latest = '';
    const lastIdx = n - 1;
    if (points[lastIdx] !== null) {
      const color = status === 'spike' ? '#E86A92' : '#8FC9A3';
      latest = `<circle cx="${x(lastIdx).toFixed(1)}" cy="${y(points[lastIdx]).toFixed(1)}" r="4" fill="${color}" stroke="#0E1019" stroke-width="2"/>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <line x1="${pad}" x2="${W - pad}" y1="${H - pad}" y2="${H - pad}" stroke="rgba(140,150,210,0.18)"/>
      <path d="${d}" fill="none" stroke="#8FC9A3" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      ${nanMarks}${latest}${hits}
    </svg>`;
  }

  // ---------- render ----------

  const $ = (id) => document.getElementById(id);
  const root = document.querySelector('.attaya');
  let lastStage = '';
  let lastHistoryKey = '';
  let lastCard = '';
  let lastReport = '';
  let lastTeapots = '';
  let lastSpark = '';
  let state;

  function moodLine(s) {
    if (s.flashLine) return s.flashLine;
    if (s.done) return 'Third round done. Go take a real break.';
    const t = s.training;
    if (s.mood === 'boiling' && t && t.status === 'nan') return 'Loss is NaN. Check the learning rate and your data.';
    if (s.mood === 'boiling') return `${s.errorCount} errors bubbling. Sip them one at a time.`;
    if (s.mood === 'nervous') return `The loss has flattened out around ${t.latest}. The pot is getting nervous.`;
    if (s.mood === 'prayer' && s.prayer && s.prayer.pause) return `${s.prayer.pause.name} time. Take your time; the round will wait.`;
    if (s.phase === 'break') {
      return s.away
        ? `The water is reheating. Round ${s.round + 1} is next.`
        : "Water won't boil if you watch it. Step away from the keyboard.";
    }
    if (s.mood === 'fasting') return 'The teapot rests until iftar. Your rounds carry on as usual.';
    if (s.awaitingReturn) return `The water's hot. Round ${s.round} starts when you're back.`;
    if (s.mood === 'dozing') return "Wake me when you're back. The round is paused.";
    if (s.paused) return `Round ${s.round} is resting. Resume when you're ready.`;
    if (s.greeting) return `Welcome back. Round ${s.round} is steeping again.`;
    if (t && t.status === 'improving') return `Loss is going down (${t.latest}). Brewing calmly.`;
    if (s.foam >= 80) return `Deep focus. Round ${s.round} has thick foam.`;
    if (s.sugar < 30) return `Round ${s.round} is steeping. Still bitter; fix something to sweeten it.`;
    if (s.sugar >= 70) return `Round ${s.round} is steeping, and the pot is sweet.`;
    return `You're in flow. Round ${s.round} is steeping.`;
  }

  function wolofKey(s) {
    if (s.mood === 'pouring') return s.flashBig ? 'bigPour' : 'pouring';
    if (s.done) return 'done';
    if (s.mood === 'brewing' && s.greeting) return 'greeting';
    if (s.mood === 'brewing' && s.foam >= 60) return 'calm';
    return s.mood;
  }

  function renderStage(s) {
    const key = `${s.mood}|${s.teapot}`;
    if (key === lastStage) return;
    $('stage').innerHTML = Pots.svg(s.mood, s.teapot, 'stage');
    $('stage').setAttribute('aria-label', ARIA[s.mood] || ARIA.brewing);
    lastStage = key;
  }

  function renderRounds(s) {
    const onBreak = s.phase === 'break' && !s.done;
    if (s.done) $('roundLabel').textContent = 'POT EMPTY';
    else if (onBreak) $('roundLabel').textContent = `REHEATING · ROUND ${s.round + 1} NEXT`;
    else $('roundLabel').textContent = `ROUND ${s.round} OF 3`;

    if (s.done) $('timer').textContent = 'done';
    else if (onBreak) $('timer').textContent = clock(s.breakRemaining);
    else if (s.paused) $('timer').textContent = 'paused';
    else if (s.awaitingReturn) $('timer').textContent = 'ready';
    else $('timer').textContent = clock(s.remaining);

    const progress = 1 - s.remaining / s.roundSeconds;
    $('glasses').innerHTML = ROUND_NAMES.map((name, i) => {
      const n = i + 1;
      let gstate = 'future';
      let fill = 0;
      let color = teaColor(s.sugar);
      let foam = s.foam;
      if (s.done || n < s.round || (n === s.round && onBreak)) {
        gstate = 'done';
        fill = 1;
        if (s.roundSugar[i] !== undefined) color = teaColor(s.roundSugar[i]);
        foam = s.roundFoam[i] !== undefined ? s.roundFoam[i] : 0;
      } else if (n === s.round) {
        gstate = 'current';
        fill = Math.max(0.06, progress);
      }
      const title = gstate === 'future' ? name : `${name}: ${foamLabel(foam).toLowerCase()} foam`;
      return `<div class="glass ${gstate === 'current' ? 'current' : ''}" title="${title}">${glass(fill, gstate, color, foam)}<span>${name}</span></div>`;
    }).join('');

    $('sugarFill').style.width = `${Math.max(4, s.sugar)}%`;
    $('sugarFill').style.background = teaColor(s.sugar);
    $('sugarMeter').setAttribute('aria-valuenow', String(Math.round(s.sugar)));
    $('sugarMeter').setAttribute('aria-valuetext', sugarLabel(s.sugar));
    $('sugarLabel').textContent = sugarLabel(s.sugar);

    if (s.done) $('toggle').textContent = 'Brew a fresh pot';
    else if (onBreak) $('toggle').textContent = 'Skip the break';
    else $('toggle').textContent = s.paused ? 'Resume the round' : 'Pause the round';
    $('fresh').hidden = s.done; // the main button already brews a fresh pot
  }

  function renderTraining(t) {
    $('training').hidden = !t;
    $('watchTraining').hidden = !!t;
    if (!t) {
      lastSpark = '';
      return;
    }
    const [label, tone] = t.error ? [t.error, 'bad'] : TRAINING_STATUS[t.status] || TRAINING_STATUS.waiting;
    $('trainingFile').textContent = t.file;
    $('trainingFile').title = t.file;
    $('trainingStatus').textContent = label;
    $('trainingDot').className = `dot ${tone}`;
    $('lossLatest').textContent = t.latest || '–';
    $('lossBest').textContent = t.best || '–';
    $('lossCount').textContent = String(t.count);
    const key = JSON.stringify([t.points, t.status]);
    if (key !== lastSpark) {
      $('spark').innerHTML = sparkSvg(t.points, t.status);
      $('spark').setAttribute('aria-label', `Training loss over the last ${t.points.length} points. Latest ${t.latest || 'none'}, best ${t.best || 'none'}. ${label}.`);
      lastSpark = key;
    }
  }

  function renderPrayer(p) {
    $('prayer').hidden = !p;
    if (!p) return;
    if (!p.ready) {
      $('prayerHead').textContent = 'PRAYER TIMES';
      $('prayerTime').textContent = '';
      $('prayerLine').textContent = 'Set attaya.prayer.latitude and attaya.prayer.longitude to see prayer times.';
    } else if (p.pause) {
      $('prayerHead').textContent = p.pause.name.toUpperCase();
      $('prayerTime').textContent = `until ${timeLabel(p.pause.until)}`;
      $('prayerLine').textContent = 'The round is paused. Press Resume if you are back sooner.';
    } else if (p.fasting && p.iftar) {
      $('prayerHead').textContent = 'FASTING';
      $('prayerTime').textContent = `iftar ${timeLabel(p.iftar)}`;
      $('prayerLine').textContent = `Iftar in ${durationLabel(p.iftar - Date.now())}.`;
    } else if (p.next) {
      $('prayerHead').textContent = 'NEXT PRAYER';
      $('prayerTime').textContent = timeLabel(p.next.time);
      $('prayerLine').textContent = `${p.next.name}, in ${durationLabel(p.next.time - Date.now())}.`;
    } else {
      $('prayerHead').textContent = 'NEXT PRAYER';
      $('prayerTime').textContent = '';
      $('prayerLine').textContent = "That was Isha. Fajr is tomorrow's first.";
    }
  }

  function renderCards(s) {
    $('summary').hidden = !s.done;
    if (s.done) {
      const card = potCardSvg(s);
      if (card !== lastCard) {
        $('card').innerHTML = card;
        const p = s.pot;
        $('card').setAttribute('aria-label', `Today's pot: ${Math.round(p.focusSeconds / 60)} minutes of focus, ${p.errorsSipped} errors sipped, ${p.commits} commits, ${p.testsPassed} test runs passed, ended ${sugarLabel(s.sugar).toLowerCase()}.`);
        lastCard = card;
      }
    }

    $('report').hidden = !s.report;
    $('openReport').hidden = !!s.report;
    if (s.report) {
      const card = weekCardSvg(s.report);
      if (card !== lastReport) {
        const r = s.report;
        $('reportCard').innerHTML = card;
        $('reportCard').setAttribute('aria-label', `This week: ${r.glasses} glasses poured, ${r.sipped} errors sipped, longest focus ${Math.round(r.longestFocus / 60)} minutes, at the pot ${r.activeDays} of 7 days, streak ${r.streak}.`);
        lastReport = card;
      }
    } else {
      lastReport = '';
    }
  }

  function renderTeapots(s) {
    const key = JSON.stringify([s.teapot, s.teapots.map((t) => t.unlocked), s.bestStreak]);
    if (key === lastTeapots) return;
    lastTeapots = key;
    const owned = s.teapots.filter((t) => t.unlocked).length;
    $('teapotNote').textContent = `${owned} of ${s.teapots.length} unlocked`;
    $('teapots').innerHTML = s.teapots.map((t) => {
      const selected = t.id === s.teapot;
      const sub = t.unlocked ? (selected ? 'In use' : 'Use') : `${t.streak}-day streak`;
      return `<button type="button" class="teapot${selected ? ' selected' : ''}${t.unlocked ? '' : ' locked'}" data-id="${t.id}"
        ${t.unlocked ? '' : 'aria-disabled="true"'} aria-pressed="${selected}" title="${t.name}${t.unlocked ? '' : `: unlocks with a ${t.streak}-day streak`}">
        ${Pots.thumb(t.id, `pick-${t.id}`)}<span class="name">${t.name}</span><span class="sub">${t.unlocked ? '' : '🔒 '}${sub}</span></button>`;
    }).join('');
  }

  function render(s) {
    state = s;
    root.dataset.mood = s.mood;
    renderStage(s);
    $('moodTitle').textContent = TITLES[s.mood] || TITLES.brewing;
    $('moodLine').textContent = moodLine(s);

    const wolof = s.language === 'wolof' ? WOLOF[wolofKey(s)] : undefined;
    $('wolof').hidden = !wolof;
    if (wolof) {
      $('wolof').textContent = wolof[0];
      $('wolof').title = wolof[1];
      $('wolof').setAttribute('aria-label', `${wolof[0]}, Wolof for "${wolof[1]}"`);
    }

    renderRounds(s);
    renderTraining(s.training);
    renderPrayer(s.prayer);
    renderCards(s);

    $('streak').textContent = s.streak === 1 ? '1 day' : `${s.streak} days`;
    $('sipped').textContent = String(s.errorsSipped);
    $('glassesPoured').textContent = String(s.glasses);

    if (s.history.key !== lastHistoryKey) {
      $('history').innerHTML = historySvg(s.history);
      const activeDays = s.history.cells.filter((c) => c.active).length;
      const total = s.history.cells.reduce((sum, c) => sum + c.glasses, 0);
      $('historyNote').textContent = `${activeDays} active days`;
      $('history').setAttribute('aria-label', `Last 13 weeks: coded on ${activeDays} days, ${total} glasses poured`);
      lastHistoryKey = s.history.key;
    }

    renderTeapots(s);
  }

  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (!msg) return;
    if (msg.type === 'state') render(msg.state);
    if (msg.type === 'sound' && Sounds) Sounds.play(msg.name);
  });
  const send = (type, extra) => vscode.postMessage({ type, ...extra });
  $('toggle').addEventListener('click', () => send('toggleRound'));
  $('fresh').addEventListener('click', () => send('freshPot'));
  $('saveCard').addEventListener('click', () => { if (state && state.done) exportCard(potCardSvg(state), 'pot'); });
  $('saveReport').addEventListener('click', () => { if (state && state.report) exportCard(weekCardSvg(state.report), 'week'); });
  $('closeReport').addEventListener('click', () => send('closeReport'));
  $('openReport').addEventListener('click', () => send('openReport'));
  $('watchTraining').addEventListener('click', () => send('watchTraining'));
  $('stopTraining').addEventListener('click', () => send('stopTraining'));
  $('teapots').addEventListener('click', (e) => {
    const btn = e.target.closest('.teapot');
    if (btn && !btn.classList.contains('locked')) send('chooseTeapot', { id: btn.dataset.id });
  });
  send('ready');
})();
