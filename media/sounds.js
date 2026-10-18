// Small synthesized sounds: a glass clink, a soft pour and a lid rattle.
// Generated with Web Audio, so there are no audio files to ship or license.
window.AttayaSounds = (function () {
  let ctx;

  function audio() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function noiseBuffer(ac, seconds) {
    const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * seconds), ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function envelope(ac, at, peak, attack, decay) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    g.connect(ac.destination);
    return g;
  }

  // Two glass partials, the second clink a little softer.
  function clink(ac, at) {
    [[0, 0.12], [0.11, 0.07]].forEach(([offset, peak]) => {
      [2637, 3951].forEach((freq, i) => {
        const osc = ac.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq * (offset ? 1.02 : 1);
        osc.connect(envelope(ac, at + offset, i ? peak / 2 : peak, 0.004, 0.55));
        osc.start(at + offset);
        osc.stop(at + offset + 0.6);
      });
    });
  }

  // Filtered noise sweeping up, like tea filling a small glass.
  function pour(ac, at) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, 1.1);
    const band = ac.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.4;
    band.frequency.setValueAtTime(700, at);
    band.frequency.exponentialRampToValueAtTime(1700, at + 1.0);
    src.connect(band);
    band.connect(envelope(ac, at, 0.09, 0.12, 0.95));
    src.start(at);
    src.stop(at + 1.1);
    clink(ac, at + 1.05);
  }

  // A few quick metallic ticks, like a lid jumping on a boiling pot.
  function rattle(ac, at) {
    for (let i = 0; i < 7; i++) {
      const t = at + i * 0.075 + Math.random() * 0.015;
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer(ac, 0.04);
      const high = ac.createBiquadFilter();
      high.type = 'highpass';
      high.frequency.value = 2500;
      src.connect(high);
      high.connect(envelope(ac, t, 0.08, 0.002, 0.035));
      src.start(t);
      src.stop(t + 0.04);
    }
  }

  const SOUNDS = { clink, pour, rattle };

  return {
    play(name) {
      try {
        const ac = audio();
        if (ac && SOUNDS[name]) SOUNDS[name](ac, ac.currentTime + 0.02);
      } catch (err) {
        // Sound is a nicety; never let it break the sidebar.
      }
    },
  };
})();
