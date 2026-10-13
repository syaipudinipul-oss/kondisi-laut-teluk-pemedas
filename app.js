(function () {
  'use strict';

  const HOME = { lat: -0.9972749666666666, lon: 117.1514503 };
  const TZ = 'Asia/Makassar';
  const UTC_OFFSET = '+08:00';
  const MARINE_VARS = [
    'wave_height', 'wave_direction', 'wave_period',
    'swell_wave_height', 'swell_wave_direction', 'swell_wave_period',
    'wind_wave_height', 'wind_wave_direction', 'wind_wave_period',
    'ocean_current_velocity', 'ocean_current_direction',
    'sea_surface_temperature', 'sea_level_height_msl'
  ].join(',');
  const WEATHER_VARS = [
    'temperature_2m', 'relative_humidity_2m', 'precipitation_probability',
    'precipitation', 'weather_code', 'cloud_cover', 'visibility',
    'pressure_msl', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m'
  ].join(',');
  const WAVE_MODELS = [
    { id: 'ecmwf_wam', name: 'ECMWF WAM', color: 'var(--m1)' },
    { id: 'ncep_gfswave025', name: 'NOAA GFS-Wave', color: 'var(--m2)' },
    { id: 'dwd_gwam', name: 'DWD GWAM', color: 'var(--m3)' },
    { id: 'meteofrance_wave', name: 'Météo-France MFWAM', color: 'var(--m4)' }
  ];
  const WIND_MODELS = [
    { id: 'ecmwf_ifs', name: 'ECMWF IFS', color: 'var(--m1)' },
    { id: 'gfs_global', name: 'NOAA GFS', color: 'var(--m2)' },
    { id: 'icon_global', name: 'DWD ICON', color: 'var(--m3)' },
    { id: 'ukmo_global_deterministic_10km', name: 'UK Met Office', color: 'var(--m4)' }
  ];

  const state = {
    point: { ...HOME },
    data: null,
    selected: 0,
    now: 0,
    playTimer: null,
    controller: null,
    requestId: 0,
    map: null,
    marker: null,
    baseLayers: {},
    referenceLayer: null,
    activeBase: null,
    seamarkLayer: null
  };

  const $ = (id) => document.getElementById(id);
  const finite = (value) => Number.isFinite(Number(value));
  const num = (value, fallback = 0) => finite(value) ? Number(value) : fallback;
  const at = (array, index, fallback = null) => Array.isArray(array) && finite(array[index]) ? Number(array[index]) : fallback;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const average = (values) => {
    const clean = values.filter(finite).map(Number);
    return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
  };
  const maximum = (values) => {
    const clean = values.filter(finite).map(Number);
    return clean.length ? Math.max(...clean) : null;
  };

  function apiUrl(base, params) {
    const url = new URL(base);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    return url.toString();
  }

  async function fetchJson(url, signal) {
    const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Permintaan data gagal (${response.status})`);
    const payload = await response.json();
    if (payload.error) throw new Error(payload.reason || 'Sumber data mengembalikan kesalahan.');
    return payload;
  }

  function dataUrls(point) {
    const common = {
      latitude: point.lat.toFixed(5),
      longitude: point.lon.toFixed(5),
      timezone: TZ,
      past_days: 1,
      forecast_days: 5
    };
    return {
      marine: apiUrl('https://marine-api.open-meteo.com/v1/marine', { ...common, hourly: MARINE_VARS, cell_selection: 'sea' }),
      weather: apiUrl('https://api.open-meteo.com/v1/forecast', { ...common, hourly: WEATHER_VARS, wind_speed_unit: 'kn' }),
      waveModels: apiUrl('https://marine-api.open-meteo.com/v1/marine', {
        ...common,
        hourly: 'wave_height,wave_period',
        models: WAVE_MODELS.map((model) => model.id).join(','),
        cell_selection: 'sea'
      }),
      windModels: apiUrl('https://api.open-meteo.com/v1/forecast', {
        ...common,
        hourly: 'wind_speed_10m,wind_gusts_10m',
        models: WIND_MODELS.map((model) => model.id).join(','),
        wind_speed_unit: 'kn'
      })
    };
  }

  async function loadData(options = {}) {
    const requestId = ++state.requestId;
    if (state.controller) state.controller.abort();
    state.controller = new AbortController();
    setLoading(true);
    $('msg').innerHTML = '';

    try {
      const urls = dataUrls(state.point);
      const [marine, weather, waveModels, windModels] = await Promise.all([
        fetchJson(urls.marine, state.controller.signal),
        fetchJson(urls.weather, state.controller.signal),
        fetchJson(urls.waveModels, state.controller.signal).catch(() => null),
        fetchJson(urls.windModels, state.controller.signal).catch(() => null)
      ]);
      if (requestId !== state.requestId) return;
      if (!marine.hourly || !marine.hourly.time || !weather.hourly) throw new Error('Data prakiraan tidak lengkap.');

      state.data = { marine, weather, waveModels, windModels };
      state.now = findNowIndex(marine.hourly.time);
      state.selected = options.keepTime ? clamp(state.selected, 0, marine.hourly.time.length - 1) : state.now;
      configureSlider();
      renderAll();
      const stamp = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date());
      $('dot').className = 'dot';
      $('stamp').textContent = `Diperbarui ${stamp} WITA`;
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error(`Gagal memuat atau merender prakiraan: ${error.stack || error}`);
      showError(error.message || 'Data tidak dapat dimuat.');
    } finally {
      if (requestId === state.requestId) setLoading(false);
    }
  }

  function setLoading(loading) {
    $('btn-refresh').disabled = loading;
    if (loading) {
      $('dot').className = 'dot load';
      $('stamp').textContent = 'Memuat data…';
    }
  }

  function showError(message) {
    $('dot').className = 'dot err';
    $('stamp').textContent = 'Data gagal dimuat';
    $('msg').innerHTML = `<div class="banner">${escapeHtml(message)} Coba tekan Perbarui.</div>`;
    $('status').className = 'status lm1';
    $('status').innerHTML = '<div class="ic">!</div><div><div class="big">Tidak tersedia</div><p class="why">Periksa koneksi internet lalu muat ulang data.</p></div>';
  }

  function findNowIndex(times) {
    const formatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone: TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', hourCycle: 'h23'
    });
    const localHour = formatter.format(new Date()).replace(' ', 'T').slice(0, 13);
    const exact = times.findIndex((time) => time.slice(0, 13) === localHour);
    if (exact >= 0) return exact;
    const target = Date.parse(`${localHour}:00${UTC_OFFSET}`);
    let best = 0;
    let distance = Infinity;
    times.forEach((time, index) => {
      const delta = Math.abs(Date.parse(`${time}:00${UTC_OFFSET}`) - target);
      if (delta < distance) { best = index; distance = delta; }
    });
    return best;
  }

  function configureSlider() {
    const times = state.data.marine.hourly.time;
    $('slider').max = String(times.length - 1);
    $('slider').value = String(state.selected);
    $('t-a').textContent = shortDate(times[0]);
    $('t-b').textContent = shortDate(times[times.length - 1]);
  }

  function renderAll() {
    if (!state.data) return;
    renderTime();
    renderHeader();
    renderStatus();
    renderCards();
    renderComparison();
    renderStrip();
    renderCharts();
    renderMapData();
  }

  function renderTime() {
    const time = state.data.marine.hourly.time[state.selected];
    $('when').textContent = longDate(time);
    const isNow = state.selected === state.now;
    $('badge-now').hidden = !isNow;
    $('btn-now').hidden = isNow;
    $('slider').value = String(state.selected);
  }

  function renderHeader() {
    const coordinate = coordinateText(state.point.lat, state.point.lon);
    $('hdr-coord').textContent = coordinate;
    $('coords').innerHTML = `<b>Titik prakiraan</b><br>${coordinate}`;
  }

  function modelValues(models, variable, index) {
    if (!models || !models.hourly) return [];
    return models.hourly ? modelsListFor(variable).map((model) => at(models.hourly[`${variable}_${model.id}`], index)) : [];
  }

  function modelsListFor(variable) {
    return variable.startsWith('wave') ? WAVE_MODELS : WIND_MODELS;
  }

  function snapshot(index = state.selected) {
    const marine = state.data.marine.hourly;
    const weather = state.data.weather.hourly;
    const waveValues = modelValues(state.data.waveModels, 'wave_height', index);
    const periodValues = modelValues(state.data.waveModels, 'wave_period', index);
    const windValues = modelValues(state.data.windModels, 'wind_speed_10m', index);
    const gustValues = modelValues(state.data.windModels, 'wind_gusts_10m', index);
    const automaticWave = at(marine.wave_height, index, 0);
    const automaticWind = at(weather.wind_speed_10m, index, 0);
    const automaticGust = at(weather.wind_gusts_10m, index, 0);
    return {
      automaticWave,
      automaticWind,
      automaticGust,
      waveAvg: average(waveValues) ?? automaticWave,
      waveMax: maximum([automaticWave, ...waveValues]) ?? automaticWave,
      periodAvg: average(periodValues) ?? at(marine.wave_period, index, 0),
      periodMax: maximum([at(marine.wave_period, index), ...periodValues]) ?? at(marine.wave_period, index, 0),
      windAvg: average(windValues) ?? automaticWind,
      windMax: maximum([automaticWind, ...windValues]) ?? automaticWind,
      gustAvg: average(gustValues) ?? automaticGust,
      gustMax: maximum([automaticGust, ...gustValues]) ?? automaticGust,
      rain: at(weather.precipitation, index, 0)
    };
  }

  function renderStatus() {
    const snap = snapshot();
    let level = 0;
    if (snap.waveMax >= 4 || snap.windMax >= 48 || snap.rain >= 50) level = 3;
    else if (snap.waveMax >= 2.5 || snap.windMax >= 34 || snap.rain >= 20) level = 2;
    else if (snap.waveMax >= 1.25 || snap.windMax >= 22 || snap.rain >= 10) level = 1;

    const labels = ['Aman', 'Waspada', 'Berbahaya', 'Sangat berbahaya'];
    const icons = ['✓', '!', '!', '×'];
    const reasons = [
      'Gelombang rendah, angin lemah, tanpa hujan lebat.',
      'Kondisi mulai meningkat. Kapal kecil perlu meningkatkan kewaspadaan.',
      'Gelombang, angin, atau hujan berpotensi membahayakan pelayaran.',
      'Kondisi ekstrem. Tunda pelayaran dan ikuti peringatan resmi.'
    ];
    $('status').className = `status l${level}`;
    $('status').innerHTML = `
      <div class="ic">${icons[level]}</div>
      <div>
        <div class="big">${labels[level]}</div>
        <p class="why">${reasons[level]}</p>
        <p class="basis">Dasar penilaian: nilai tertinggi antar model (konservatif). Gelombang maks ${snap.waveMax.toFixed(1)} m, rata-rata ${snap.waveAvg.toFixed(1)} m · Angin maks ${snap.windMax.toFixed(0)} kn, rata-rata ${snap.windAvg.toFixed(0)} kn.</p>
      </div>`;
  }

  function tile(label, value, unit, subline = '&nbsp;', wide = false, textValue = false) {
    const main = textValue ? `<span class="txt">${value}</span>` : `${value}<small>${unit}</small>`;
    return `<div class="tile${wide ? ' wide' : ''}"><div class="k">${label}</div><div class="v">${main}</div><div class="s">${subline}</div></div>`;
  }

  function directionIcon(degrees, isFrom) {
    const rotation = ((num(degrees) + (isFrom ? 180 : 0)) % 360 + 360) % 360;
    return `<span class="ico ico-dir" style="transform:rotate(${rotation.toFixed(0)}deg)" aria-hidden="true"></span>`;
  }

  function renderCards() {
    const i = state.selected;
    const marine = state.data.marine.hourly;
    const weather = state.data.weather.hourly;
    const snap = snapshot(i);
    const waveDir = at(marine.wave_direction, i, 0);
    const currentKn = currentInKnots(i);
    const currentDir = at(marine.ocean_current_direction, i, 0);
    const windDir = at(weather.wind_direction_10m, i, 0);
    const tide = at(marine.sea_level_height_msl, i, 0);
    const tidePrev = at(marine.sea_level_height_msl, Math.max(0, i - 1), tide);
    const nextLow = nextTideExtreme(i, 'low');

    $('g-wave').innerHTML = [
      tile('Tinggi gelombang signifikan · rata-rata 4 model', snap.waveAvg.toFixed(1), 'm',
        `Periode ${snap.periodAvg.toFixed(1)} s · ${directionIcon(waveDir, true)} dari ${compass(waveDir)} (${waveDir.toFixed(0)}°)<span class="br"></span>Otomatis ${snap.automaticWave.toFixed(1)} m · tertinggi ${snap.waveMax.toFixed(1)} m`, true),
      tile('Swell', at(marine.swell_wave_height, i, 0).toFixed(1), 'm', `${at(marine.swell_wave_period, i, 0).toFixed(1)} s · ${compass(at(marine.swell_wave_direction, i, 0))}`),
      tile('Gelombang angin', at(marine.wind_wave_height, i, 0).toFixed(1), 'm', `${at(marine.wind_wave_period, i, 0).toFixed(1)} s`)
    ].join('');

    $('g-sea').innerHTML = [
      tile('Kecepatan arus', currentKn.toFixed(2), 'kn', `${(currentKn / 1.94384).toFixed(2)} m/s · ${directionIcon(currentDir, false)} menuju ${compass(currentDir)} (${currentDir.toFixed(0)}°)`),
      tile('Muka laut (MSL)', tide.toFixed(2), 'm', `${tide < tidePrev ? 'Turun' : 'Naik'} · Surut terendah ${nextLow.time} (${nextLow.value.toFixed(2)} m)`),
      tile('Suhu permukaan laut', at(marine.sea_surface_temperature, i, 0).toFixed(1), '°C'),
      tile('Tekanan udara', at(weather.pressure_msl, i, 0).toFixed(0), 'hPa')
    ].join('');

    const wind = snap.windAvg;
    const beaufort = beaufortInfo(wind);
    $('g-wx').innerHTML = [
      tile('Angin · rata-rata 4 model', wind.toFixed(0), 'kn',
        `Hembusan ${snap.gustAvg.toFixed(0)} kn · ${directionIcon(windDir, true)} dari ${compass(windDir)} (${windDir.toFixed(0)}°)<span class="br"></span>Otomatis ${snap.automaticWind.toFixed(0)} kn · tertinggi ${snap.windMax.toFixed(0)} kn`),
      tile('Skala Beaufort', String(beaufort.level), '', beaufort.label),
      tile('Cuaca', weatherName(at(weather.weather_code, i, 0)), '', `Suhu ${at(weather.temperature_2m, i, 0).toFixed(1)} °C · RH ${at(weather.relative_humidity_2m, i, 0).toFixed(0)}%`, true, true),
      tile('Hujan', at(weather.precipitation, i, 0).toFixed(1), 'mm/jam', `Peluang ${at(weather.precipitation_probability, i, 0).toFixed(0)}%`),
      tile('Awan · Jarak pandang', at(weather.cloud_cover, i, 0).toFixed(0), '%', `Visibilitas ${(at(weather.visibility, i, 0) / 1000).toFixed(1)} km`)
    ].join('');
  }

  function nextTideExtreme(start, kind) {
    const values = state.data.marine.hourly.sea_level_height_msl;
    const end = Math.min(values.length, start + 25);
    let bestIndex = start;
    for (let index = start; index < end; index += 1) {
      if (!finite(values[index])) continue;
      if (!finite(values[bestIndex]) || (kind === 'low' ? values[index] < values[bestIndex] : values[index] > values[bestIndex])) bestIndex = index;
    }
    return { value: num(values[bestIndex]), time: hourOnly(state.data.marine.hourly.time[bestIndex]) };
  }

  function renderComparison() {
    const i = state.selected;
    const marine = state.data.marine.hourly;
    const weather = state.data.weather.hourly;
    const waveRows = WAVE_MODELS.map((model) => ({
      ...model,
      value: at(state.data.waveModels?.hourly?.[`wave_height_${model.id}`], i),
      secondary: at(state.data.waveModels?.hourly?.[`wave_period_${model.id}`], i)
    }));
    const windRows = WIND_MODELS.map((model) => ({
      ...model,
      value: at(state.data.windModels?.hourly?.[`wind_speed_10m_${model.id}`], i),
      secondary: at(state.data.windModels?.hourly?.[`wind_gusts_10m_${model.id}`], i)
    }));
    const waveAutomatic = { name: 'Otomatis (panel)', color: 'var(--muted)', dash: true, value: at(marine.wave_height, i, 0), secondary: at(marine.wave_period, i, 0) };
    const windAutomatic = { name: 'Otomatis (panel)', color: 'var(--muted)', dash: true, value: at(weather.wind_speed_10m, i, 0), secondary: at(weather.wind_gusts_10m, i, 0) };

    $('cmp').innerHTML = [
      comparisonTable('Gelombang', 'Tinggi (m)', 'Periode (s)', waveAutomatic, waveRows),
      comparisonTable('Angin 10 m', 'Kecepatan (kn)', 'Hembusan (kn)', windAutomatic, windRows),
      '<p class="foot">Selisih antar model menggambarkan ketidakpastian prakiraan. Kartu angka memakai rata-rata model, sedangkan status memakai nilai tertinggi agar konservatif.</p>'
    ].join('');

    $('wave-legend').innerHTML = legendItems([...WAVE_MODELS, { name: 'Otomatis', color: 'var(--muted)', dash: true }]);
    $('wind-legend').innerHTML = legendItems([...WIND_MODELS, { name: 'Otomatis', color: 'var(--muted)', dash: true }]);
    $('lg-wave').innerHTML = legendItems([
      { name: 'Total', color: 'var(--s1)' }, { name: 'Swell', color: 'var(--s2)', dash: true }, { name: 'Gel. angin', color: 'var(--s3)', dot: true }
    ]);
    $('lg-wind').innerHTML = legendItems([
      { name: 'Kecepatan', color: 'var(--s1)' }, { name: 'Hembusan', color: 'var(--s2)', dash: true }
    ]);
  }

  function comparisonTable(title, headingA, headingB, automatic, rows) {
    const all = [automatic, ...rows];
    const avgA = average(rows.map((row) => row.value));
    const avgB = average(rows.map((row) => row.secondary));
    const maxA = maximum(all.map((row) => row.value));
    const maxB = maximum(all.map((row) => row.secondary));
    const body = all.map((row) => `<tr><th><i class="sw${row.dash ? ' dash' : ''}" style="--c:${row.color}"></i>${row.name}</th><td>${formatMaybe(row.value, 2)}</td><td>${formatMaybe(row.secondary, 1)}</td></tr>`).join('');
    return `<div class="tblwrap"><table><thead><tr><th>${title}</th><th>${headingA}</th><th>${headingB}</th></tr></thead><tbody>${body}<tr class="sum"><th>Rata-rata model</th><td>${formatMaybe(avgA, 2)}</td><td>${formatMaybe(avgB, 1)}</td></tr><tr class="sum"><th>Tertinggi (dasar status)</th><td>${formatMaybe(maxA, 2)}</td><td>${formatMaybe(maxB, 1)}</td></tr></tbody></table></div>`;
  }

  function renderStrip() {
    const times = state.data.marine.hourly.time;
    const indexes = [];
    for (let offset = 0; offset < 24 && state.selected + offset < times.length; offset += 3) indexes.push(state.selected + offset);
    const rows = [
      ['Cuaca', indexes.map((i) => weatherName(at(state.data.weather.hourly.weather_code, i, 0)))],
      ['Gelombang maks (m)', indexes.map((i) => snapshot(i).waveMax.toFixed(1)), 'wave'],
      ['Gelombang rata-rata (m)', indexes.map((i) => snapshot(i).waveAvg.toFixed(1)), 'wave'],
      ['Angin maks (kn)', indexes.map((i) => `${snapshot(i).windMax.toFixed(0)} ${compass(at(state.data.weather.hourly.wind_direction_10m, i, 0))}`)],
      ['Angin rata-rata (kn)', indexes.map((i) => snapshot(i).windAvg.toFixed(0))],
      ['Arus (kn)', indexes.map((i) => currentInKnots(i).toFixed(1))],
      ['Hujan (mm)', indexes.map((i) => at(state.data.weather.hourly.precipitation, i, 0).toFixed(1))]
    ];
    const head = indexes.map((index) => `<th>${hourOnly(times[index])}</th>`).join('');
    const body = rows.map(([label, values, kind]) => `<tr><th>${label}</th>${values.map((value) => `<td class="${kind === 'wave' ? waveClass(Number(value)) : ''}">${value}</td>`).join('')}</tr>`).join('');
    $('strip').innerHTML = `<table><thead><tr><th>Jam</th>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  function renderCharts() {
    const marine = state.data.marine.hourly;
    const weather = state.data.weather.hourly;
    const times = marine.time;
    const waveSeries = WAVE_MODELS.map((model) => ({ name: model.name, color: model.color, values: state.data.waveModels?.hourly?.[`wave_height_${model.id}`] || [] }));
    waveSeries.push({ name: 'Otomatis', color: 'var(--muted)', dash: true, values: marine.wave_height });
    const windSeries = WIND_MODELS.map((model) => ({ name: model.name, color: model.color, values: state.data.windModels?.hourly?.[`wind_speed_10m_${model.id}`] || [] }));
    windSeries.push({ name: 'Otomatis', color: 'var(--muted)', dash: true, values: weather.wind_speed_10m });
    drawChart('cWaveM', times, waveSeries, { minZero: true });
    drawChart('cWindM', times, windSeries, { minZero: true });
    drawChart('cWave', times, [
      { name: 'Total', color: 'var(--s1)', values: marine.wave_height },
      { name: 'Swell', color: 'var(--s2)', dash: true, values: marine.swell_wave_height },
      { name: 'Gelombang angin', color: 'var(--s3)', dot: true, values: marine.wind_wave_height }
    ], { minZero: true });
    drawChart('cWind', times, [
      { name: 'Kecepatan', color: 'var(--s1)', values: weather.wind_speed_10m },
      { name: 'Hembusan', color: 'var(--s2)', dash: true, values: weather.wind_gusts_10m }
    ], { minZero: true });
    drawChart('cCur', times, [{ name: 'Arus', color: 'var(--s1)', values: times.map((_, index) => currentInKnots(index)) }], { minZero: true });
    drawChart('cTide', times, [{ name: 'Muka laut', color: 'var(--s1)', values: marine.sea_level_height_msl }], {});
    drawChart('cRain', times, [{ name: 'Hujan', color: 'var(--s1)', values: weather.precipitation }], { minZero: true, bars: true });
  }

  function drawChart(id, times, series, options) {
    const W = 640;
    const H = 176;
    const pad = { left: 42, right: 10, top: 10, bottom: 25 };
    const values = series.flatMap((item) => item.values || []).filter(finite).map(Number);
    if (!values.length) { $(id).innerHTML = '<div class="note">Data model tidak tersedia.</div>'; return; }
    let min = options.minZero ? 0 : Math.min(...values);
    let max = Math.max(...values);
    if (min === max) { min -= .5; max += .5; }
    const margin = options.minZero ? max * .08 : (max - min) * .08;
    max += margin || .2;
    if (!options.minZero) min -= margin || .2;
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;
    const x = (index) => pad.left + (index / Math.max(1, times.length - 1)) * plotW;
    const y = (value) => pad.top + (max - value) / (max - min) * plotH;
    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Grafik prakiraan">`;

    for (let tick = 0; tick <= 3; tick += 1) {
      const value = min + (max - min) * (tick / 3);
      const yy = y(value);
      svg += `<line class="chart-grid" x1="${pad.left}" y1="${yy}" x2="${W - pad.right}" y2="${yy}"></line><text class="chart-axis" x="${pad.left - 6}" y="${yy + 3}" text-anchor="end">${chartNumber(value)}</text>`;
    }
    for (let index = 0; index < times.length; index += 24) {
      const xx = x(index);
      svg += `<line class="chart-grid" x1="${xx}" y1="${pad.top}" x2="${xx}" y2="${H - pad.bottom}"></line><text class="chart-axis" x="${xx}" y="${H - 7}" text-anchor="middle">${dayLabel(times[index])}</text>`;
    }

    if (options.bars) {
      const width = Math.max(1, plotW / times.length - .8);
      const baseY = y(Math.max(0, min));
      (series[0].values || []).forEach((value, index) => {
        if (!finite(value)) return;
        const yy = y(Number(value));
        svg += `<rect class="chart-bar" x="${x(index) - width / 2}" y="${Math.min(yy, baseY)}" width="${width}" height="${Math.max(1, Math.abs(baseY - yy))}" fill="${series[0].color}"><title>${longDate(times[index])}: ${Number(value).toFixed(1)}</title></rect>`;
      });
    } else {
      series.forEach((item) => {
        let path = '';
        let drawing = false;
        (item.values || []).forEach((value, index) => {
          if (!finite(value)) { drawing = false; return; }
          path += `${drawing ? 'L' : 'M'}${x(index).toFixed(2)},${y(Number(value)).toFixed(2)} `;
          drawing = true;
        });
        const style = item.dash ? ' dash' : item.dot ? ' dot' : '';
        svg += `<path class="chart-line${style}" d="${path}" stroke="${item.color}"><title>${escapeHtml(item.name)}</title></path>`;
      });
    }
    const focusX = x(state.selected);
    svg += `<line x1="${focusX}" y1="${pad.top}" x2="${focusX}" y2="${H - pad.bottom}" stroke="var(--ink)" opacity=".34" stroke-width="1" vector-effect="non-scaling-stroke"></line>`;
    series.forEach((item) => {
      const value = item.values?.[state.selected];
      if (finite(value)) svg += `<circle class="chart-focus" cx="${focusX}" cy="${y(Number(value))}" r="3.5" fill="${item.color}"><title>${escapeHtml(item.name)}: ${Number(value).toFixed(2)}</title></circle>`;
    });
    svg += '</svg>';
    $(id).innerHTML = svg;
  }

  function renderMapData() {
    renderHeader();
    if (!state.map || !state.data) return;
    state.marker.setLatLng([state.point.lat, state.point.lon]);
    state.marker.bindPopup(`<b>Titik prakiraan</b><br>${coordinateText(state.point.lat, state.point.lon)}`);
  }

  function initMap() {
    if (!window.L) {
      $('map').innerHTML = '<div class="note" style="margin:20px">Pustaka peta tidak dapat dimuat. Ringkasan prakiraan tetap tersedia.</div>';
      return;
    }
    state.map = L.map('map', { zoomControl: false, attributionControl: false }).setView([HOME.lat, HOME.lon], 10);
    state.baseLayers.ocean = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 13 });
    state.baseLayers.sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18 });
    state.baseLayers.osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
    state.referenceLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 13, zIndex: 2 });
    state.seamarkLayer = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', { maxZoom: 18, zIndex: 4 });
    setBaseLayer('ocean');
    L.control.zoom({ position: 'topright' }).addTo(state.map);
    L.control.attribution({ position: 'bottomright', prefix: '<a href="https://leafletjs.com">Leaflet</a>' }).addTo(state.map).addAttribution('Esri, GEBCO, NOAA, Garmin');
    state.marker = L.marker([HOME.lat, HOME.lon], {
      icon: L.divIcon({ className: 'pin', html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 11] })
    }).addTo(state.map);
    state.map.on('click', (event) => {
      state.point = { lat: event.latlng.lat, lon: event.latlng.lng };
      state.marker.setLatLng(event.latlng);
      renderHeader();
      loadData();
    });
  }

  function setBaseLayer(name) {
    if (!state.map) return;
    if (state.activeBase) state.map.removeLayer(state.activeBase);
    if (state.referenceLayer && state.map.hasLayer(state.referenceLayer)) state.map.removeLayer(state.referenceLayer);
    state.activeBase = state.baseLayers[name];
    state.activeBase.addTo(state.map);
    if (name === 'ocean') state.referenceLayer.addTo(state.map);
    if (state.marker) state.marker.setZIndexOffset(1000);
  }

  function currentInKnots(index) {
    const value = at(state.data.marine.hourly.ocean_current_velocity, index, 0);
    const unit = state.data.marine.hourly_units?.ocean_current_velocity || 'km/h';
    if (unit === 'm/s') return value * 1.94384;
    if (unit === 'kn') return value;
    return value * 0.539957;
  }

  function setSelected(index) {
    if (!state.data) return;
    state.selected = clamp(Number(index), 0, state.data.marine.hourly.time.length - 1);
    renderAll();
  }

  function togglePlay() {
    if (!state.data) return;
    if (state.playTimer) { stopPlay(); return; }
    $('play-ic').className = 'ico ico-pause';
    state.playTimer = window.setInterval(() => {
      if (state.selected >= state.data.marine.hourly.time.length - 1) { stopPlay(); return; }
      setSelected(state.selected + 1);
    }, 450);
  }

  function stopPlay() {
    if (state.playTimer) window.clearInterval(state.playTimer);
    state.playTimer = null;
    $('play-ic').className = 'ico ico-play';
  }

  function bindEvents() {
    $('btn-refresh').addEventListener('click', () => loadData({ keepTime: true }));
    $('btn-home').addEventListener('click', () => {
      state.point = { ...HOME };
      state.map?.setView([HOME.lat, HOME.lon], 10);
      renderHeader();
      loadData();
    });
    $('btn-now').addEventListener('click', () => setSelected(state.now));
    $('btn-play').addEventListener('click', togglePlay);
    $('slider').addEventListener('input', (event) => { stopPlay(); setSelected(event.target.value); });
    document.querySelectorAll('input[name="base"]').forEach((input) => input.addEventListener('change', () => setBaseLayer(input.value)));
    $('seamark').addEventListener('change', (event) => {
      if (!state.map) return;
      if (event.target.checked) state.seamarkLayer.addTo(state.map);
      else state.map.removeLayer(state.seamarkLayer);
    });
    window.addEventListener('beforeunload', () => state.controller?.abort());
  }

  function coordinateText(lat, lon) {
    const latAbs = Math.abs(lat);
    const lonAbs = Math.abs(lon);
    const latDeg = Math.floor(latAbs);
    const lonDeg = Math.floor(lonAbs);
    return `${latDeg}°${((latAbs - latDeg) * 60).toFixed(3)}′ ${lat < 0 ? 'LS' : 'LU'} · ${lonDeg}°${((lonAbs - lonDeg) * 60).toFixed(3)}′ ${lon < 0 ? 'BB' : 'BT'}`;
  }

  function parseTime(time) { return new Date(`${time}:00${UTC_OFFSET}`); }
  function longDate(time) {
    return new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(parseTime(time)).replace('.', ':') + ' WITA';
  }
  function shortDate(time) {
    return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', timeZone: TZ }).format(parseTime(time));
  }
  function dayLabel(time) {
    return new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', timeZone: TZ }).format(parseTime(time));
  }
  function hourOnly(time) { return `${time.slice(11, 16)}`; }
  function formatMaybe(value, digits) { return finite(value) ? Number(value).toFixed(digits) : '–'; }
  function chartNumber(value) { return Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(1); }
  function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
  function waveClass(value) { return value >= 4 ? 'l3' : value >= 2.5 ? 'l2' : value >= 1.25 ? 'l1' : ''; }
  function legendItems(items) {
    return `<span class="legend-items">${items.map((item) => `<span class="lg"><i class="${item.dash ? 'dash' : item.dot ? 'dot2' : ''}" style="--c:${item.color}"></i>${item.name}</span>`).join('')}</span>`;
  }

  function compass(degrees) {
    const points = ['U', 'UTL', 'TL', 'TTL', 'T', 'TGR', 'TG', 'STG', 'S', 'SBD', 'BD', 'BBD', 'B', 'BBL', 'BL', 'UBL'];
    return points[Math.round((((num(degrees) % 360) + 360) % 360) / 22.5) % 16];
  }

  function weatherName(code) {
    const names = {
      0: 'Cerah', 1: 'Cerah berawan', 2: 'Berawan sebagian', 3: 'Berawan',
      45: 'Berkabut', 48: 'Kabut beku', 51: 'Gerimis ringan', 53: 'Gerimis', 55: 'Gerimis lebat',
      56: 'Gerimis beku', 57: 'Gerimis beku lebat', 61: 'Hujan ringan', 63: 'Hujan sedang', 65: 'Hujan lebat',
      66: 'Hujan beku', 67: 'Hujan beku lebat', 71: 'Salju ringan', 73: 'Salju', 75: 'Salju lebat', 77: 'Butir salju',
      80: 'Hujan lokal ringan', 81: 'Hujan lokal', 82: 'Hujan lokal lebat', 85: 'Salju lokal', 86: 'Salju lokal lebat',
      95: 'Badai petir', 96: 'Badai petir & hujan es', 99: 'Badai petir hebat'
    };
    return names[Math.round(num(code))] || 'Tidak diketahui';
  }

  function beaufortInfo(knots) {
    const limits = [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64];
    const labels = ['Tenang', 'Angin sangat lemah', 'Sepoi lemah', 'Sepoi lembut', 'Sepoi sedang', 'Sepoi segar', 'Angin kuat', 'Angin kencang', 'Badai', 'Badai kuat', 'Badai sangat kuat', 'Badai dahsyat', 'Topan'];
    const level = limits.findIndex((limit) => knots < limit);
    const normalized = level < 0 ? 12 : level;
    return { level: normalized, label: labels[normalized] };
  }

  initMap();
  bindEvents();
  renderHeader();
  loadData();
})();
