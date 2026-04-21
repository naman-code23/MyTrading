function getCssColor(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function createChartManager() {
  const charts = new Map();

  function destroy(key) {
    const chart = charts.get(key);
    if (chart) {
      chart.destroy();
      charts.delete(key);
    }
  }

  function buildBaseOptions(label) {
    const axisColor = getCssColor('--muted', '#a1a1aa');
    const gridColor = getCssColor('--line', '#27272a');
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
          labels: { color: axisColor },
        },
        tooltip: {
          mode: 'index',
          intersect: false,
        },
        title: label ? { display: false, text: label } : undefined,
      },
      scales: {
        x: {
          ticks: { color: axisColor },
          grid: { color: gridColor },
        },
        y: {
          ticks: { color: axisColor },
          grid: { color: gridColor },
        },
      },
    };
  }

  function render(key, canvas, config) {
    if (!canvas || typeof window.Chart === 'undefined') return;
    destroy(key);
    const context = canvas.getContext('2d');
    charts.set(key, new window.Chart(context, config));
  }

  function renderLine(key, canvas, labels, data, label = '') {
    const color = getCssColor('--blue', '#60a5fa');
    render(key, canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label,
          data,
          borderColor: color,
          backgroundColor: color,
          tension: 0.25,
          pointRadius: 2,
          borderWidth: 2,
          fill: false,
        }],
      },
      options: buildBaseOptions(label),
    });
  }

  function renderBar(key, canvas, labels, data, label = '') {
    const color = getCssColor('--cyan', '#22d3ee');
    render(key, canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label,
          data,
          backgroundColor: color,
          borderRadius: 8,
        }],
      },
      options: buildBaseOptions(label),
    });
  }

  function renderHorizontalBar(key, canvas, labels, data, label = '') {
    const color = getCssColor('--purple', '#a78bfa');
    const options = buildBaseOptions(label);
    options.indexAxis = 'y';
    render(key, canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label,
          data,
          backgroundColor: color,
          borderRadius: 8,
        }],
      },
      options,
    });
  }

  function clearAll() {
    [...charts.keys()].forEach(destroy);
  }

  return {
    renderLine,
    renderBar,
    renderHorizontalBar,
    clearAll,
  };
}
