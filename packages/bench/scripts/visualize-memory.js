#!/usr/bin/env node

/**
 * Memory Profile Visualizer
 * Generates an HTML report from the JSON timeline produced by profile-memory.js.
 *
 * Usage: node visualize-memory.js [input-file] [output-file]
 */

import { readFileSync, writeFileSync } from 'fs'

const inputFile = process.argv[2] || './memory-profile.json'
const outputFile = process.argv[3] || './memory-profile.html'

let profile
try {
  profile = JSON.parse(readFileSync(inputFile, 'utf8'))
  console.log(`Loaded profile: ${profile.timeline.length} samples from ${inputFile}`)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Error reading ${inputFile}:`, message)
  process.exit(1)
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Atchara Memory Profile</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e0e0e0; line-height: 1.6; padding: 2rem; }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { font-size: 2.5rem; margin-bottom: 0.5rem; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .subtitle { color: #888; margin-bottom: 2rem; font-size: 1rem; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .stat { background: #1a1a1a; border-radius: 8px; padding: 1.25rem; border: 1px solid #333; }
    .stat-label { color: #888; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-value { font-size: 1.5rem; font-weight: 700; color: #fff; font-family: Monaco, monospace; }
    .stat-unit { font-size: 0.9rem; color: #667eea; }
    .section { background: #1a1a1a; border-radius: 12px; padding: 2rem; margin-bottom: 2rem; border: 1px solid #333; }
    .section-title { font-size: 1.3rem; color: #fff; margin-bottom: 1rem; }
    .chart-container { position: relative; height: 350px; }
    @media (max-width: 768px) { body { padding: 1rem; } h1 { font-size: 2rem; } }
  </style>
</head>
<body>
  <div class="container">
    <h1>Memory Profile</h1>
    <p class="subtitle">parseLarge memory timeline</p>

    <div class="summary" id="summary"></div>

    <div class="section">
      <h2 class="section-title">JS Memory Over Time</h2>
      <div class="chart-container"><canvas id="js-memory"></canvas></div>
    </div>

    <div class="section">
      <h2 class="section-title">Rust Buffer State</h2>
      <div class="chart-container"><canvas id="rust-buffer"></canvas></div>
    </div>

    <div class="section">
      <h2 class="section-title">Disk Usage (redb)</h2>
      <div class="chart-container"><canvas id="disk-usage"></canvas></div>
    </div>
  </div>

  <script>
    const profile = ${JSON.stringify(profile)};
    const { meta, summary, timeline } = profile;

    Chart.defaults.color = '#888';
    Chart.defaults.borderColor = '#333';

    const fmt = (bytes) => {
      if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(2) + ' GB';
      if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
      if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return bytes + ' B';
    };

    // Summary cards
    const summaryEl = document.getElementById('summary');
    const stats = [
      { label: 'Input Size', value: fmt(meta.input_size) },
      { label: 'Peak RSS', value: fmt(summary.peak_rss) },
      { label: 'Peak Heap', value: fmt(summary.peak_heap_used) },
      { label: 'Peak Rust Buffer', value: fmt(summary.peak_rust_buffer) },
      { label: 'Peak redb File', value: fmt(summary.peak_redb_file) },
      { label: 'Total Chunks', value: meta.total_chunks.toLocaleString() },
      { label: 'Elapsed', value: (meta.elapsed_ms / 1000).toFixed(2) + 's' },
      { label: 'Samples', value: meta.total_samples.toLocaleString() },
    ];
    summaryEl.innerHTML = stats.map(s =>
      '<div class="stat"><div class="stat-label">' + s.label + '</div><div class="stat-value">' + s.value + '</div></div>'
    ).join('');

    // Use bytes_fed as x-axis for all charts (more meaningful than time)
    const xLabels = timeline.map(t => (t.bytes_fed / 1024 / 1024).toFixed(1));
    const xTitle = 'Data Fed (MB)';

    function makeChart(canvasId, datasets, yLabel) {
      new Chart(document.getElementById(canvasId), {
        type: 'line',
        data: { labels: xLabels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          elements: { point: { radius: 0 }, line: { borderWidth: 2 } },
          plugins: {
            legend: { position: 'top', labels: { usePointStyle: true, padding: 20 } },
            tooltip: {
              mode: 'index',
              intersect: false,
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              padding: 12,
              callbacks: { label: (ctx) => ctx.dataset.label + ': ' + fmt(ctx.parsed.y) }
            }
          },
          scales: {
            x: {
              title: { display: true, text: xTitle },
              grid: { color: '#222' },
              ticks: { maxTicksLimit: 20 }
            },
            y: {
              title: { display: true, text: yLabel },
              grid: { color: '#222' },
              ticks: { callback: (v) => fmt(v) }
            }
          }
        }
      });
    }

    // JS Memory chart
    makeChart('js-memory', [
      { label: 'RSS', data: timeline.map(t => t.rss), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true },
      { label: 'Heap Used', data: timeline.map(t => t.heap_used), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true },
      { label: 'External', data: timeline.map(t => t.external), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', fill: true },
      { label: 'Array Buffers', data: timeline.map(t => t.array_buffers), borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.1)', fill: true },
    ], 'Memory');

    // Rust buffer chart
    makeChart('rust-buffer', [
      { label: 'Buffer Size', data: timeline.map(t => t.rust_buffer_size), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true },
      { label: 'Buffer Capacity', data: timeline.map(t => t.rust_buffer_capacity), borderColor: '#6366f1', borderDash: [5, 5] },
    ], 'Bytes');

    // Disk usage chart
    makeChart('disk-usage', [
      { label: 'redb File Size', data: timeline.map(t => t.redb_file_size), borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.1)', fill: true },
    ], 'Size');
  </script>
</body>
</html>`

try {
  writeFileSync(outputFile, html)
  console.log(`Generated visualization: ${outputFile}`)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Error writing ${outputFile}:`, message)
  process.exit(1)
}
