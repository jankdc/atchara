#!/usr/bin/env node

/**
 * Benchmark Results Visualizer
 * Generates an interactive HTML dashboard from benchmark-results.json
 * Usage: node visualize-benchmarks.js [input-file] [output-file]
 */

import { readFileSync, writeFileSync } from 'fs'
import { basename } from 'path'

const inputFile = process.argv[2] || './benchmark-results.json'
const outputFile = process.argv[3] || './benchmark-results.html'

// Read and parse benchmark results
let benchmarkData
try {
  benchmarkData = JSON.parse(readFileSync(inputFile, 'utf8'))
  console.log(`✓ Loaded benchmark data from ${inputFile}`)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`✗ Error reading ${inputFile}:`, message)
  process.exit(1)
}

// Transform data for visualization
const sections = benchmarkData.files.flatMap((file) =>
  file.groups.map((group) => {
    const benchmarks = group.benchmarks
      .map((b) => ({
        name: b.name,
        rank: b.rank,
        hz: b.hz,
        mean: b.mean * 1000,
        median: b.median * 1000,
        rme: b.rme,
        p99: b.p99 !== null ? b.p99 * 1000 : null,
        sampleCount: b.sampleCount,
        relativeSpeed: 0,
      }))
      .sort((a, b) => a.rank - b.rank)

    const fastestHz = benchmarks[0].hz
    benchmarks.forEach((b) => (b.relativeSpeed = fastestHz / b.hz))

    return {
      title: group.fullName.split(' > ').slice(1).join(' > '),
      file: basename(file.filepath),
      benchmarks,
    }
  })
)

console.log(`✓ Processed ${sections.length} benchmark sections`)

// Generate HTML
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Atchara Benchmark Results</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e0e0e0; line-height: 1.6; padding: 2rem; }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { font-size: 2.5rem; margin-bottom: 0.5rem; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .subtitle { color: #888; margin-bottom: 2rem; font-size: 1rem; }
    .section { background: #1a1a1a; border-radius: 12px; padding: 2rem; margin-bottom: 2rem; border: 1px solid #333; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3); }
    .section-title { font-size: 1.5rem; color: #fff; margin-bottom: 0.25rem; }
    .section-file { color: #667eea; font-size: 0.875rem; font-family: Monaco, monospace; margin-bottom: 1.5rem; }
    .charts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(500px, 1fr)); gap: 2rem; margin-bottom: 2rem; }
    .chart-container { position: relative; height: 300px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th { background: #2a2a2a; padding: 0.75rem; text-align: left; font-weight: 600; border-bottom: 2px solid #667eea; color: #fff; }
    td { padding: 0.75rem; border-bottom: 1px solid #333; }
    tr:hover { background: #252525; }
    .rank-badge { display: inline-block; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: bold; font-size: 0.75rem; color: #fff; }
    .parser-name { display: inline-flex; align-items: center; gap: 0.5rem; }
    .metric { font-family: Monaco, monospace; }
    .fastest { color: #10b981; font-weight: 600; }
    @media (max-width: 768px) { .charts-grid { grid-template-columns: 1fr; } body { padding: 1rem; } h1 { font-size: 2rem; } }
  </style>
</head>
<body>
  <div class="container">
    <h1>Atchara Benchmark Results</h1>
    <p class="subtitle">Interactive visualization of parser performance metrics</p>
    <div id="sections"></div>
  </div>

  <script>
    const sections = ${JSON.stringify(sections)};

    Chart.defaults.color = '#888';
    Chart.defaults.borderColor = '#333';

    // Generate contrasting colors using HSL color space
    // This ensures good visibility and contrast between different parsers
    function generateColor(index, total) {
      // Distribute colors evenly across the hue spectrum (0-360)
      const hue = (index * 360 / Math.max(total, 5)) % 360;
      // Use high saturation and moderate lightness for vibrant, visible colors
      const saturation = 70;
      const lightness = 55;
      return {
        bg: \`hsla(\${hue}, \${saturation}%, \${lightness}%, 0.6)\`,
        border: \`hsl(\${hue}, \${saturation}%, \${lightness}%)\`
      };
    }

    // Collect all unique parser names from all sections
    const allParserNames = [...new Set(sections.flatMap(s => s.benchmarks.map(b => b.name)))];

    // Generate color map for all parsers
    const colors = {};
    allParserNames.forEach((name, index) => {
      colors[name] = generateColor(index, allParserNames.length);
    });

    const fmt = (n) => {
      if (n == null || isNaN(n)) return '—';
      return n >= 1e6 ? (n/1e6).toFixed(2)+'M' : n >= 1e3 ? (n/1e3).toFixed(2)+'K' : n.toFixed(2);
    };

    function chart(id, data, label, yLabel) {
      new Chart(document.getElementById(id), {
        type: 'bar',
        data: {
          labels: data.map(d => d.name),
          datasets: [{
            label,
            data: data.map(d => d.value),
            backgroundColor: data.map(d => colors[d.name].bg),
            borderColor: data.map(d => colors[d.name].border),
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              padding: 12,
              callbacks: {
                label: (ctx) => {
                  const val = ctx.parsed.y;
                  if (val == null || isNaN(val)) return '—';
                  return yLabel === 'Operations/sec' ? \`\${fmt(val)} ops/sec\` : \`\${val.toFixed(3)} ms\`;
                }
              }
            }
          },
          scales: {
            y: { beginAtZero: true, title: { display: true, text: yLabel }, grid: { color: '#333' }, ticks: { callback: (v) => {
              if (v == null || isNaN(v)) return '—';
              return yLabel === 'Operations/sec' ? fmt(v) : v.toFixed(2);
            } } },
            x: { grid: { display: false } }
          }
        }
      });
    }

    sections.forEach((s, i) => {
      const div = document.createElement('div');
      div.className = 'section';
      div.innerHTML = \`
        <h2 class="section-title">\${s.title}</h2>
        <div class="section-file">\${s.file}</div>
        <div class="charts-grid">
          <div class="chart-container"><canvas id="hz-\${i}"></canvas></div>
          <div class="chart-container"><canvas id="mean-\${i}"></canvas></div>
        </div>
        <table>
          <thead><tr><th>Name</th><th>Throughput</th><th>Relative</th><th>Mean</th><th>Median</th><th>P99</th><th>RME</th><th>Samples</th></tr></thead>
          <tbody>\${s.benchmarks.map(b => {
            const color = colors[b.name];
            return \`
            <tr>
              <td>
                <div class="parser-name">
                  <span class="rank-badge" style="background-color: \${color.border};">#\${b.rank}</span>
                  <span>\${b.name}</span>
                </div>
              </td>
              <td class="metric \${b.rank === 1 ? 'fastest' : ''}">\${fmt(b.hz)} ops/sec</td>
              <td class="metric \${b.rank === 1 ? 'fastest' : ''}">\${b.relativeSpeed === 1 ? '1.0x' : (b.relativeSpeed != null && !isNaN(b.relativeSpeed) ? b.relativeSpeed.toFixed(2)+'x slower' : '—')}</td>
              <td class="metric">\${b.mean != null && !isNaN(b.mean) ? b.mean.toFixed(3) + ' ms' : '—'}</td>
              <td class="metric">\${b.median != null && !isNaN(b.median) ? b.median.toFixed(3) + ' ms' : '—'}</td>
              <td class="metric">\${b.p99 != null && !isNaN(b.p99) ? b.p99.toFixed(3) + ' ms' : '—'}</td>
              <td class="metric">\${b.rme != null && !isNaN(b.rme) ? b.rme.toFixed(2) + '%' : '—'}</td>
              <td class="metric">\${fmt(b.sampleCount)}</td>
            </tr>
          \`;
          }).join('')}</tbody>
        </table>
      \`;
      document.getElementById('sections').appendChild(div);

      setTimeout(() => {
        chart(\`hz-\${i}\`, s.benchmarks.map(b => ({ name: b.name, value: b.hz })), 'Throughput (ops/sec)', 'Operations/sec');
        chart(\`mean-\${i}\`, s.benchmarks.map(b => ({ name: b.name, value: b.mean })), 'Mean Time', 'Time (ms)');
      }, 0);
    });

    console.log(\`✓ Rendered \${sections.length} benchmark sections\`);
  </script>
</body>
</html>`

// Write HTML file
try {
  writeFileSync(outputFile, html)
  console.log(`✓ Generated visualization: ${outputFile}`)
  console.log(`\nOpen ${outputFile} in your browser to view the results.`)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`✗ Error writing ${outputFile}:`, message)
  process.exit(1)
}
