# Image quality measurement and release process

The earlier `portfolio-v1` zero-error/lossless proposal is withdrawn. It was not
calibrated to this portfolio and has been removed from the upload, migration and
backfill paths. No production images were changed.

The objective is good perceptual quality at an appropriate transfer size, not
numerical identity to a JPEG decode or a compulsory output format.

## Reproducible collection benchmark

```sh
npm run quality:prepare
npm run quality:benchmark
npm run quality:benchmark -- --avif --variants large
npm run quality:summary
npm run quality:escalate
npm run quality:summary
npm run quality:report
npm run quality:audit
npm run test:quality
```

`quality:prepare` pins the published inventory (including uploaded images missing
from the seed file) and the official libjxl 0.12.0 SSIMULACRA2 executable. On
Windows it downloads the official release ZIP and checks its pinned SHA-256.
Elsewhere, set `SSIMULACRA2_EXE` to the equivalent reference executable.
Use a fresh `QUALITY_BENCHMARK_DIR` for a new live snapshot; existing snapshots
and downloaded images are deliberately reused for reproducibility.

The default benchmark compares the current derivative, lossy WebP q85/q90/q95
(effort 4, sharp chroma conversion), and MozJPEG q90 4:4:4 at **each** of the
three published dimensions. The AVIF pass compares q75/q85, effort 4, 4:4:4,
8-bit, at the large viewing size. This is a bounded codec/settings comparison,
not a claim to have exhausted every encoder or quality setting.

Optional `--id <id>`, `--variants medium,large,full`, and `--shard 0/3` support
focused runs and disjoint parallel work. Do not run overlapping work against the
same candidate rows. Each completed row is saved and reused when resuming.
Full-resolution comparisons can consume several GB of RAM per metric process.

All files stay local under the benchmark directory. Neither benchmark nor audit
uploads images, modifies D1, or publishes a site. A summary is incomplete until
all expected image/size/candidate rows exist; missing files and failures remain
explicit. The audit exits nonzero for current derivatives below the review
thresholds (80 for grid previews, 85 for large/full), rather than silently
calling untested images acceptable.

## What is measured

* SHA-256 and bytes for the source and each derivative; source hashes are checked
  against the seed where available. Later uploads receive recorded hashes.
* SSIMULACRA2 at matched pixel dimensions, using the official reference tool.
* RGB PSNR, maximum channel error, alpha error, and the worst 64x64 tile's PSNR
  and position, as secondary diagnostics.
* Encoding time, codec versions and settings. Timings during concurrent work
  are indicative, not isolated encoder performance benchmarks.

Sources are oriented and colour-converted to sRGB, then resized to the exact
published dimensions before encoding. Both reference and decoded candidate are
fed to SSIMULACRA2 as PNG. This avoids comparing unlike resolutions or colour
spaces. It measures additional encoding damage, not source JPEG quality, focus,
noise, lens quality or damage caused by resizing itself. The capped panorama
has a lower-resolution reference than its native JPEG and must remain explicit.
All newly encoded candidates use the same reference raster. Live files can
include historical resizer/colour-pipeline differences, especially the three
browser-uploaded photos; their scores evaluate the deployed rendition against
that common reference, not a perfectly isolated codec-only experiment.

SSIMULACRA2 evaluates structural similarity plus introduced edges and smoothing
across multiple scales. Its author's scale describes 80 as very high quality,
85 as excellent and 90 as visually lossless **for an average observer under
specified tests**. These are useful review targets, not guarantees that the
photographer will accept a particular image. PSNR alone is not a perceptual
acceptance test. A mathematically lossless result is not required.

[Metric definition and interpretation](https://github.com/cloudinary/ssimulacra2)

## Release decisions

Use per-image rate/quality comparisons and inspect flagged crops at 100%.
Do not increase quality indefinitely, silently fall back to lossless, or accept
files larger than an equally good original just to retain a WebP extension.
Retain the original export as the reference. Include JPEG and AVIF when they
provide a better measured trade-off, and separate graphics from photographs.

Quality thresholds should nominate review candidates. Approval should account
for smooth gradients, fine texture, saturated edges and the intended display
size. Preserve a small reviewed regression set, including the kite example and
poor-performing images from the full collection.

`quality:escalate` tests JPEG q95 and AVIF q90 on completed difficult cases that
miss the proposed grid/viewing targets. A candidate remains unresolved if these
still fail; no lossless fallback is inserted. The selector can also prefer an
existing original over a recompression with only marginal byte savings. Scores
nominate files for review, rather than authorizing publication automatically.

The lightbox currently downloads `full` immediately. PhotoSwipe supports a
responsive `srcset` and adjusts its requested size when zooming. Evaluate
responsive delivery separately from compression: smaller viewing derivatives
can finance higher quality, while native resolution is reserved for inspection.

[PhotoSwipe responsive-image support](https://photoswipe.com/getting-started/)

Benchmark results and the recommended strategy are recorded separately in
`image-quality-analysis.md` once the full run completes.
