// Teapot art: every mood, in every unlockable design.
// Each SVG gets a unique id suffix (uid) because several pots can share the page,
// and gradient ids must not collide.
window.AttayaPots = (function () {
  const INK = '#12141F';

  const STYLES = {
    classic: { body: '#E8833A', lid: '#F2C14E', handle: '#C9A14A' },
    indigo: { body: '#5B7BD8', lid: '#F4EFE3', handle: '#A9B9EE', specks: true },
    wonjo: { body: '#E86A92', lid: '#F4EFE3', handle: '#C9A14A', specks: true },
    mint: { body: '#6FB58A', lid: '#F2C14E', handle: '#C9A14A', specks: true },
    tiedye: { gradient: 'tiedye', lid: '#F2C14E', handle: '#C9A14A' },
    gold: { gradient: 'gold', lid: '#FBE38E', handle: '#B8862B', crescent: true },
  };

  function parts(styleId, uid) {
    const s = STYLES[styleId] || STYLES.classic;
    const id = `pf-${uid}`;
    let defs = '';
    let fill = s.body;
    if (s.gradient === 'tiedye') {
      defs = `<defs><radialGradient id="${id}" cx="45%" cy="62%" r="20%" spreadMethod="reflect">
        <stop offset="0" stop-color="#E86A92"/><stop offset="0.35" stop-color="#F2C14E"/>
        <stop offset="0.7" stop-color="#8FC9A3"/><stop offset="1" stop-color="#7FA7E8"/></radialGradient></defs>`;
      fill = `url(#${id})`;
    } else if (s.gradient === 'gold') {
      defs = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#FBE38E"/><stop offset="0.55" stop-color="#D9A630"/><stop offset="1" stop-color="#F2C14E"/></linearGradient></defs>`;
      fill = `url(#${id})`;
    }
    let decor = '';
    if (s.specks) {
      decor += [[38, 58], [84, 62], [46, 86], [72, 88], [33, 72]]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="#FFFFFF" opacity="0.45"/>`).join('');
    }
    if (s.crescent) {
      decor += '<path d="M58 82 a5 5 0 1 0 5 8 a4 4 0 1 1 -5 -8 Z" fill="#FFF6D5" opacity="0.85"/><circle cx="65" cy="83" r="1" fill="#FFF6D5"/>';
    }
    const body = `<path d="M86 62 C98 58, 100 44, 108 32 L112 35 C106 48, 104 64, 90 76 Z" fill="${fill}"/>
      <path d="M30 50 C30 30, 90 30, 90 50 C96 70, 86 94, 60 96 C34 94, 24 70, 30 50 Z" fill="${fill}"/>
      <path d="M34 54 C36 46, 44 42, 50 42" stroke="#FFFFFF" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.35"/>${decor}`;
    const handle = `<path d="M32 50 C14 48, 12 78, 34 80" stroke="${s.handle}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    const lid = `<ellipse cx="60" cy="36" rx="23" ry="6" fill="${s.lid}"/><circle cx="60" cy="27" r="5" fill="${s.lid}"/>`;
    const lidTilted = `<g transform="rotate(-12 60 36)"><ellipse cx="60" cy="34" rx="23" ry="6" fill="${s.lid}"/><circle cx="60" cy="25" r="5" fill="${s.lid}"/></g>`;
    return { defs, body, handle, lid, lidTilted };
  }

  const cheeks = '<ellipse cx="43" cy="71" rx="4" ry="2.4" fill="#E86A92" opacity="0.7"/><ellipse cx="77" cy="71" rx="4" ry="2.4" fill="#E86A92" opacity="0.7"/>';
  const calmEyes = `<path d="M46 65 Q50 61 54 65" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M66 65 Q70 61 74 65" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  const openEyes = `<circle cx="50" cy="64" r="3.4" fill="${INK}"/><circle cx="70" cy="64" r="3.4" fill="${INK}"/>
    <circle cx="51" cy="63" r="1" fill="#FFFFFF"/><circle cx="71" cy="63" r="1" fill="#FFFFFF"/>`;
  const smile = `<path d="M55 72 Q60 77 65 72" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  const softSmile = `<path d="M56 73 Q60 76 64 73" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  const steam = (color, cls = 'steam') => `<g class="${cls}">
      <path d="M98 26 C94 20, 102 15, 98 8" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M106 28 C102 22, 110 17, 106 10" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round"/>
    </g>`;

  const MOODS = {
    brewing: (p) => `<svg viewBox="0 0 120 110" aria-hidden="true">${p.defs}
      ${steam('#8FC9A3')}
      <g class="pot">${p.handle}${p.body}${p.lid}${openEyes}${cheeks}${smile}</g>
    </svg>`,

    dozing: (p) => `<svg viewBox="0 0 120 110" aria-hidden="true">${p.defs}
      <g class="zzz">
        <text x="88" y="24" fill="#7FA7E8" font-weight="800" font-size="12">z</text>
        <text x="98" y="14" fill="#7FA7E8" font-weight="800" font-size="9">z</text>
      </g>
      <g class="pot" opacity="0.85">${p.handle}${p.body}${p.lidTilted}
        <path d="M46 64 Q50 67 54 64" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
        <path d="M66 64 Q70 67 74 64" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
        <ellipse cx="60" cy="75" rx="3" ry="2.2" fill="${INK}"/>
      </g>
    </svg>`,

    boiling: (p) => `<svg viewBox="0 0 120 110" aria-hidden="true">${p.defs}
      <g class="bubbles">
        <circle cx="44" cy="22" r="4" fill="none" stroke="#E86A92" stroke-width="1.8"/>
        <circle cx="76" cy="18" r="5" fill="none" stroke="#E86A92" stroke-width="1.8"/>
        <circle cx="62" cy="12" r="3" fill="none" stroke="#E86A92" stroke-width="1.8"/>
      </g>
      <g class="steam">
        <path d="M100 24 C96 18, 106 14, 100 6" stroke="#E86A92" stroke-width="2.4" fill="none" stroke-linecap="round"/>
        <path d="M108 26 C104 20, 114 16, 108 8" stroke="#E86A92" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      </g>
      <g class="pot">${p.handle}${p.body}${p.lid}
        <path d="M44 55 L54 58" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M76 55 L66 58" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
        <circle cx="50" cy="65" r="5" fill="#F4EFE3"/><circle cx="70" cy="65" r="5" fill="#F4EFE3"/>
        <circle cx="50" cy="66" r="2.4" fill="${INK}"/><circle cx="70" cy="66" r="2.4" fill="${INK}"/>
        <path d="M53 78 Q56.5 74 60 78 Q63.5 82 67 78" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
        <path d="M84 50 C82 54, 82 57, 84.5 58 C87 57, 87 54, 84 50 Z" fill="#7FA7E8"/>
      </g>
    </svg>`,

    // Glancing sideways with a sweat drop: the training loss has stopped going down.
    nervous: (p) => `<svg viewBox="0 0 120 110" aria-hidden="true">${p.defs}
      ${steam('#8A8FAD')}
      <g class="pot wobble">${p.handle}${p.body}${p.lid}
        <circle cx="50" cy="64" r="4.4" fill="#F4EFE3"/><circle cx="70" cy="64" r="4.4" fill="#F4EFE3"/>
        <circle cx="52.4" cy="64" r="2.2" fill="${INK}"/><circle cx="72.4" cy="64" r="2.2" fill="${INK}"/>
        <path d="M53 75 Q56 72 59 75 Q62 78 65 75" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
        <path class="sweat" d="M84 50 C82 54, 82 57, 84.5 58 C87 57, 87 54, 84 50 Z" fill="#7FA7E8"/>
      </g>
    </svg>`,

    // Sitting on a small charcoal stove while the water heats back up.
    reheating: (p) => `<svg viewBox="0 0 120 130" aria-hidden="true">${p.defs}
      ${steam('#8FC9A3', 'steam slow')}
      <g class="pot">${p.handle}${p.body}${p.lid}${calmEyes}${cheeks}${softSmile}</g>
      <path d="M36 98 L84 98 L78 120 L42 120 Z" fill="#3A3F5C"/>
      <rect x="32" y="95" width="56" height="4" rx="2" fill="#5C6182"/>
      <g class="coals">
        <circle cx="48" cy="108" r="3.2" fill="#E8833A"/>
        <circle cx="60" cy="110" r="3.6" fill="#F2C14E"/>
        <circle cx="72" cy="108" r="3.2" fill="#E86A92"/>
      </g>
      <path d="M45 120 L41 127 M75 120 L79 127" stroke="#3A3F5C" stroke-width="3" stroke-linecap="round"/>
    </svg>`,

    // Quiet, eyes closed, under a crescent moon: a prayer-time pause.
    prayer: (p) => `<svg viewBox="0 0 120 110" aria-hidden="true">${p.defs}
      <g class="moon">
        <path d="M100 6 a10 10 0 1 0 9 15 a8 8 0 1 1 -9 -15 Z" fill="#F2C14E"/>
        <circle class="twinkle" cx="111" cy="8" r="1.6" fill="#F4EFE3"/>
      </g>
      <g class="pot">${p.handle}${p.body}${p.lid}${calmEyes}${cheeks}${softSmile}</g>
    </svg>`,

    // Ramadan: no steam and an upturned glass until iftar.
    fasting: (p) => `<svg viewBox="0 0 150 110" aria-hidden="true">${p.defs}
      <g class="pot">${p.handle}${p.body}${p.lid}${calmEyes}${softSmile}</g>
      <path d="M124 104 L144 104 L141 80 L127 80 Z" fill="none" stroke="#8A8FAD" stroke-width="1.6"/>
      <path d="M120 105 L148 105" stroke="#5C6182" stroke-width="1.6" stroke-linecap="round"/>
    </svg>`,

    pouring: (p) => `<svg viewBox="0 0 170 120" aria-hidden="true">${p.defs}
      <path class="stream" d="M119 60 C128 62, 136 70, 139 88" stroke="#C46A24" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M129 86 L151 86 L149 112 L131 112 Z" fill="#C46A24"/>
      <ellipse cx="140" cy="86" rx="11" ry="3" fill="#F4E2C4"/>
      <path d="M127 78 L153 78 L150 113 L130 113 Z" fill="none" stroke="#8A8FAD" stroke-width="1.6"/>
      <g class="pour-group">${p.handle}${p.body}${p.lid}
        <path d="M45 65 L50 60 L55 65" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M65 65 L70 60 L75 65" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        ${cheeks}
        <path d="M53 72 Q60 81 67 72 Z" fill="${INK}"/>
      </g>
    </svg>`,
  };

  function svg(mood, styleId, uid) {
    return (MOODS[mood] || MOODS.brewing)(parts(styleId, uid));
  }

  // A still, smiling pot for the teapot picker.
  function thumb(styleId, uid) {
    const p = parts(styleId, uid);
    return `<svg viewBox="22 20 94 80" aria-hidden="true">${p.defs}${p.handle}${p.body}${p.lid}${openEyes}${cheeks}${smile}</svg>`;
  }

  return { svg, thumb, styles: Object.keys(STYLES) };
})();
