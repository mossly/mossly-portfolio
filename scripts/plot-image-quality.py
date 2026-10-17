"""Optional scientific figure from a completed benchmark (requires matplotlib)."""
import json
import os
from pathlib import Path
import matplotlib.pyplot as plt
import numpy as np

root = Path(os.environ.get('QUALITY_BENCHMARK_DIR', '.cache/quality-benchmark'))
summary = json.loads((root / 'summary.json').read_text(encoding='utf-8-sig'))
if not summary['complete']:
    raise RuntimeError('Refusing to plot an incomplete corpus as a completed comparison')
colors = {'current': '#666666', 'webp85': '#007c91', 'webp90': '#007c91', 'webp95': '#007c91',
          'jpeg90': '#d76a16', 'avif75': '#7046ab', 'avif85': '#7046ab'}
labels = {'current': 'Current', 'webp85': 'WebP 85', 'webp90': 'WebP 90', 'webp95': 'WebP 95',
          'jpeg90': 'JPEG 90', 'avif75': 'AVIF 75', 'avif85': 'AVIF 85'}
fig, axes = plt.subplots(1, 3, figsize=(15, 5), layout='constrained')
for ax, variant in zip(axes, ['medium', 'large', 'full']):
    for candidate in labels:
        rows = [r for r in summary['rows'] if r['variant'] == variant and r['candidate'] == candidate]
        if not rows:
            continue
        scores = [r['ssimulacra2'] for r in rows]
        p10, median, p90 = np.percentile(scores, [10, 50, 90])
        mb = sum(r['bytes'] for r in rows) / 1_000_000
        ax.errorbar(mb, median, yerr=[[median-p10], [p90-median]], fmt='o', capsize=3,
                    color=colors[candidate], alpha=.85)
        ax.annotate(labels[candidate], (mb, median), xytext=(4, 4), textcoords='offset points', fontsize=8)
    ax.axhline(85, color='#333333', linestyle=':', linewidth=.8)
    ax.set_title(variant.capitalize())
    ax.set_xlabel('Total transfer size for all 85 assets (MB)')
    ax.set_ylim(50, 101)
    ax.grid(alpha=.15)
axes[0].set_ylabel('SSIMULACRA2 score (higher is better)')
fig.suptitle('Measured quality versus transfer size — 85 published assets\n'
             'Dots: median quality; bars: 10th–90th percentile. Dimensions matched within each panel.', fontsize=13)
fig.savefig(root / 'tradeoffs.png', dpi=160)
print(root / 'tradeoffs.png')
