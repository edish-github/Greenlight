/**
 * The single ffmpeg invocation.
 *
 * Hard rule: the original file is never modified. `fixed.mp4` is always a new
 * file in the scan directory, and this module refuses to run if the resolved
 * output path is the input path. A tool that damages a creator's only export is
 * worse than a tool that does nothing.
 */
import { existsSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { FfmpegError, runFfmpeg } from '../../lib/ffmpeg';
import { logger } from '../../lib/logger';
import { ARTIFACT, scanFile } from '../../store/paths';
import { writeJson } from '../../store/scans';
import type { FixPlan } from '../../types/fixplan';
import {
  buildFfmpegArgs,
  buildFilterComplex,
  describeGraph,
  type FilterGraph,
  type FilterOptions,
} from './filters';
import { buildSpanExport, summarizePlan } from './plan';

const log = logger('render');

export interface RenderResult {
  rendered: boolean;
  outputPath: string | null;
  spansPath: string | null;
  graph: FilterGraph;
  summary: string;
  filterComplex: string | null;
  ms: number;
  reason?: string;
  stderrTail?: string;
}

export interface RenderOptions extends FilterOptions {
  /** Overrides the input. Defaults to the scan's own input.mp4. */
  inputPath?: string;
  /** Overrides the output. Defaults to the scan's fixed.mp4. */
  outputPath?: string;
  timeoutMs?: number;
  onProgress?: (line: string) => void;
}

export async function renderFix(
  scanId: string,
  plan: FixPlan,
  durationMs: number,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const started = Date.now();
  const inputPath = options.inputPath ?? scanFile(scanId, ARTIFACT.input);
  const outputPath = options.outputPath ?? scanFile(scanId, ARTIFACT.fixed);
  const graph = buildFilterComplex(plan, options);
  const summary = describeGraph(graph);

  if (path.resolve(inputPath) === path.resolve(outputPath)) {
    throw new Error('Refusing to render over the original file. fixed.mp4 is always a new file.');
  }
  if (!existsSync(inputPath)) {
    throw new Error(`Input not found for scan ${scanId}: ${inputPath}`);
  }

  // The span list is written even when nothing is rendered, because an editor
  // who wants to apply the cuts themselves still wants the spans.
  const spansPath = writeJson(scanId, ARTIFACT.spans, buildSpanExport(plan, durationMs));
  writeJson(scanId, ARTIFACT.fixplan, plan);

  if (!graph.filterComplex || graph.applied.length === 0) {
    const s = summarizePlan(plan);
    return {
      rendered: false,
      outputPath: null,
      spansPath,
      graph,
      summary,
      filterComplex: null,
      ms: Date.now() - started,
      reason:
        s.manual + s.packaging > 0
          ? 'Nothing here has a safe automatic fix. The spans and suggestions are exported instead.'
          : 'No findings were selected for repair.',
    };
  }

  // Render to a temp name and move into place, so a failed encode can never
  // leave a half-written fixed.mp4 that the UI would happily offer for download.
  const tempPath = `${outputPath}.partial.mp4`;
  const args = ['-i', inputPath, ...buildFfmpegArgs(graph), tempPath];

  log.info(`rendering ${scanId}: ${summary}`);
  log.debug(`filter_complex: ${graph.filterComplex}`);

  try {
    await runFfmpeg(args, {
      timeoutMs: options.timeoutMs ?? 180_000,
      onStderr: (chunk) => options.onProgress?.(chunk.trim()),
    });
  } catch (e) {
    rmSync(tempPath, { force: true });
    const stderrTail = e instanceof FfmpegError ? e.stderrTail : undefined;
    log.error(`render failed for ${scanId}: ${e instanceof Error ? e.message : String(e)}`);
    return {
      rendered: false,
      outputPath: null,
      spansPath,
      graph,
      summary,
      filterComplex: graph.filterComplex,
      ms: Date.now() - started,
      reason: e instanceof Error ? e.message : String(e),
      stderrTail,
    };
  }

  rmSync(outputPath, { force: true });
  renameSync(tempPath, outputPath);

  return {
    rendered: true,
    outputPath,
    spansPath,
    graph,
    summary,
    filterComplex: graph.filterComplex,
    ms: Date.now() - started,
  };
}
