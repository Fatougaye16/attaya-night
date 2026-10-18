// Prayer times, calculated offline with the adhan library from a latitude/longitude.

const adhan = require('adhan');

const PRAYERS = [
  ['fajr', 'Fajr'],
  ['dhuhr', 'Dhuhr'],
  ['asr', 'Asr'],
  ['maghrib', 'Maghrib'],
  ['isha', 'Isha'],
];

const METHODS = Object.keys(adhan.CalculationMethod).filter((k) => k !== 'Other');

function validCoordinates(lat, lon) {
  return typeof lat === 'number' && typeof lon === 'number'
    && Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

// Today's five prayers as [{ key, name, time }], or [] without a valid location.
function prayerTimes(config, date = new Date()) {
  if (!validCoordinates(config.latitude, config.longitude)) return [];
  const method = METHODS.includes(config.method) ? config.method : 'MuslimWorldLeague';
  const params = adhan.CalculationMethod[method]();
  params.madhab = config.madhab === 'hanafi' ? adhan.Madhab.Hanafi : adhan.Madhab.Shafi;
  const times = new adhan.PrayerTimes(new adhan.Coordinates(config.latitude, config.longitude), date, params);
  return PRAYERS.map(([key, name]) => ({ key, name, time: times[key].getTime() }));
}

// Ramadan by the Umm al-Qura calendar. Local moon sighting can differ by a day,
// which is why the mode can also be switched on or off by hand.
function isRamadan(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric' }).format(date) === '9';
  } catch (err) {
    return false;
  }
}

module.exports = { prayerTimes, isRamadan, validCoordinates, METHODS };
