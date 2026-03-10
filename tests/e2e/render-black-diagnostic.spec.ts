import { test } from '@playwright/test';
import { resolveDatasetFixture } from './helpers/dataset';
import { launchViewerFromFixture, STANDARD_VOXEL_RESOLUTION } from './helpers/workflows';

test('diagnostic: viewer frame brightness after launch', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    type ProviderCall = {
      method: string;
      args: Array<string | number | boolean | null | Record<string, unknown>>;
    };
    const target = window as Window & {
      __LLSM_DIAG_RUNTIME_ERRORS__?: string[];
      __LLSM_PROVIDER_CALLS__?: ProviderCall[];
      __LLSM_VOLUME_PROVIDER__?: unknown;
      __LLSM_VOLUME_PROVIDER_STORE__?: unknown;
    };
    target.__LLSM_DIAG_RUNTIME_ERRORS__ = [];
    target.__LLSM_PROVIDER_CALLS__ = [];

    const summarizeArg = (arg: unknown): string | number | boolean | null | Record<string, unknown> => {
      if (arg === null || typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
        return arg;
      }
      if (Array.isArray(arg)) {
        return { type: 'array', length: arg.length };
      }
      if (typeof arg === 'object') {
        const candidate = arg as { scaleLevel?: unknown; signal?: unknown; recordLookup?: unknown };
        return {
          type: 'object',
          scaleLevel: candidate.scaleLevel ?? null,
          hasSignal: candidate.signal !== undefined,
          recordLookup: candidate.recordLookup ?? null
        };
      }
      return { type: typeof arg };
    };

    const maybeWrapProvider = (provider: unknown): unknown => {
      if (!provider || typeof provider !== 'object') {
        return provider;
      }
      const providerObject = provider as Record<string, unknown> & { __LLSM_WRAPPED_DIAG__?: boolean };
      if (providerObject.__LLSM_WRAPPED_DIAG__) {
        return provider;
      }
      const calls = target.__LLSM_PROVIDER_CALLS__;
      const wrapMethod = (name: 'getVolume' | 'getBrickPageTable' | 'getBrickAtlas') => {
        const original = providerObject[name];
        if (typeof original !== 'function') {
          return;
        }
        providerObject[name] = async (...args: unknown[]) => {
          calls?.push({ method: name, args: args.map((arg) => summarizeArg(arg)) });
          return await (original as (...methodArgs: unknown[]) => unknown).apply(provider, args);
        };
      };
      wrapMethod('getVolume');
      wrapMethod('getBrickPageTable');
      wrapMethod('getBrickAtlas');
      providerObject.__LLSM_WRAPPED_DIAG__ = true;
      return providerObject;
    };

    Object.defineProperty(window, '__LLSM_VOLUME_PROVIDER__', {
      configurable: true,
      enumerable: true,
      get() {
        return target.__LLSM_VOLUME_PROVIDER_STORE__;
      },
      set(value) {
        target.__LLSM_VOLUME_PROVIDER_STORE__ = maybeWrapProvider(value);
      }
    });

    window.addEventListener('error', (event) => {
      target.__LLSM_DIAG_RUNTIME_ERRORS__?.push(String(event?.error?.message ?? event?.message ?? 'window.error'));
    });
    window.addEventListener('unhandledrejection', (event) => {
      target.__LLSM_DIAG_RUNTIME_ERRORS__?.push(
        String(event?.reason instanceof Error ? event.reason.message : event?.reason ?? 'unhandledrejection')
      );
    });
  });

  const consoleEvents: Array<{ type: string; text: string }> = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    const type = message.type();
    if (type === 'error' || type === 'warning') {
      consoleEvents.push({ type, text: message.text() });
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  const fixture = resolveDatasetFixture();
  await launchViewerFromFixture(page, fixture, {
    channelName: 'DiagCh1',
    voxelResolution: STANDARD_VOXEL_RESOLUTION
  });

  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const forceRender = (window as Window & { __LLSM_FORCE_RENDER__?: (() => boolean) | null }).__LLSM_FORCE_RENDER__;
    if (typeof forceRender === 'function') {
      forceRender();
      forceRender();
      forceRender();
    }
  });
  await page.waitForTimeout(50);

  const runtimeSnapshot = await page.evaluate(async () => {
    const providerCalls =
      ((window as Window & { __LLSM_PROVIDER_CALLS__?: unknown[] }).__LLSM_PROVIDER_CALLS__ ?? []).slice();
    const diagnosticsGetter = (window as Window & { __LLSM_VOLUME_PROVIDER_DIAGNOSTICS__?: (() => unknown) | null })
      .__LLSM_VOLUME_PROVIDER_DIAGNOSTICS__;
    const providerDiagnostics =
      typeof diagnosticsGetter === 'function'
        ? diagnosticsGetter()
        : null;
    const providerDiagnosticsSummary =
      providerDiagnostics && typeof providerDiagnostics === 'object'
        ? (() => {
            const diagnostics = providerDiagnostics as {
              residency?: unknown;
              cachePressure?: unknown;
              missRates?: unknown;
              streaming?: unknown;
              stats?: {
                getVolumeCalls?: number;
                cacheHits?: number;
                cacheMisses?: number;
                loadsCompleted?: number;
                dataBytesRead?: number;
                chunkReadsCompleted?: number;
              };
            };
            return {
              residency: diagnostics.residency ?? null,
              cachePressure: diagnostics.cachePressure ?? null,
              missRates: diagnostics.missRates ?? null,
              streaming: diagnostics.streaming ?? null,
              stats: diagnostics.stats
                ? {
                    getVolumeCalls: diagnostics.stats.getVolumeCalls ?? 0,
                    cacheHits: diagnostics.stats.cacheHits ?? 0,
                    cacheMisses: diagnostics.stats.cacheMisses ?? 0,
                    loadsCompleted: diagnostics.stats.loadsCompleted ?? 0,
                    dataBytesRead: diagnostics.stats.dataBytesRead ?? 0,
                    chunkReadsCompleted: diagnostics.stats.chunkReadsCompleted ?? 0
                  }
                : null
            };
          })()
        : null;
    const resourceSummaryGetter = (window as Window & { __LLSM_VOLUME_RESOURCE_SUMMARY__?: (() => unknown) | null })
      .__LLSM_VOLUME_RESOURCE_SUMMARY__;
    const resourceSummary = typeof resourceSummaryGetter === 'function' ? resourceSummaryGetter() : null;
    const provider = (window as Window & { __LLSM_VOLUME_PROVIDER__?: unknown }).__LLSM_VOLUME_PROVIDER__ as
      | {
          getVolume?: (
            layerKey: string,
            timepoint: number,
            options?: { scaleLevel?: number; recordLookup?: boolean }
          ) => Promise<{ normalized: Uint8Array }>;
          getBrickPageTable?: (
            layerKey: string,
            timepoint: number,
            options?: { scaleLevel?: number }
          ) => Promise<{
            gridShape: [number, number, number];
            chunkShape: [number, number, number];
            volumeShape: [number, number, number];
            occupiedBrickCount: number;
            chunkOccupancy: Float32Array;
            chunkMin: Uint8Array;
            chunkMax: Uint8Array;
            skipHierarchy: { levels: Array<{ level: number; occupancy: Uint8Array }> };
          }>;
        }
      | null;
    const firstVolumeCall =
      providerCalls.find((entry) => {
        if (!entry || typeof entry !== 'object') {
          return false;
        }
        const method = (entry as { method?: unknown }).method;
        return method === 'getVolume';
      }) ?? null;
    const callArgs = firstVolumeCall && typeof firstVolumeCall === 'object'
      ? ((firstVolumeCall as { args?: unknown[] }).args ?? [])
      : [];
    const callLayerKey = typeof callArgs[0] === 'string' ? callArgs[0] : null;
    const callTimepoint = typeof callArgs[1] === 'number' ? callArgs[1] : 0;
    const layerKeysFromDom = Array.from(
      document.querySelectorAll('input[id^="channel-"][id*="-layer-"]')
    )
      .map((node) => {
        const id = node.getAttribute('id');
        if (!id) {
          return null;
        }
        const marker = '-layer-';
        const markerIndex = id.indexOf(marker);
        if (markerIndex < 0) {
          return null;
        }
        return id.slice(markerIndex + marker.length) || null;
      })
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
    const manifestLayerKeys = (() => {
      const manifest = (window as Window & { __LLSM_PREPROCESSED_MANIFEST__?: unknown }).__LLSM_PREPROCESSED_MANIFEST__ as
        | {
            dataset?: {
              channels?: Array<{ layers?: Array<{ key?: string | null }> }>;
            };
          }
        | undefined;
      const keys = manifest?.dataset?.channels?.flatMap((channel) =>
        (channel.layers ?? [])
          .map((layer) => (typeof layer.key === 'string' ? layer.key : null))
          .filter((value): value is string => Boolean(value))
      );
      return Array.isArray(keys) ? keys : [];
    })();
    const resolvedLayerKey = layerKeysFromDom[0] ?? manifestLayerKeys[0] ?? callLayerKey;

    let sampledLayer: Record<string, unknown> | null = null;
    if (
      provider &&
      resolvedLayerKey &&
      typeof provider.getVolume === 'function' &&
      typeof provider.getBrickPageTable === 'function'
    ) {
      const [volume, pageTable] = await Promise.all([
        provider.getVolume(resolvedLayerKey, callTimepoint, { scaleLevel: 0, recordLookup: false }),
        provider.getBrickPageTable(resolvedLayerKey, callTimepoint, { scaleLevel: 0 })
      ]);
      let nonZeroVoxels = 0;
      let maxValue = 0;
      for (let index = 0; index < volume.normalized.length; index += 1) {
        const value = volume.normalized[index] ?? 0;
        if (value > 0) {
          nonZeroVoxels += 1;
        }
        if (value > maxValue) {
          maxValue = value;
        }
      }
      let occupiedLeafBricks = 0;
      for (let index = 0; index < pageTable.chunkOccupancy.length; index += 1) {
        if ((pageTable.chunkOccupancy[index] ?? 0) > 0) {
          occupiedLeafBricks += 1;
        }
      }
      const root = pageTable.skipHierarchy.levels[pageTable.skipHierarchy.levels.length - 1];
      sampledLayer = {
        layerKey: resolvedLayerKey,
        timepoint: callTimepoint,
        normalizedNonZeroValues: nonZeroVoxels,
        normalizedMaxValue: maxValue,
        pageTableGridShape: pageTable.gridShape,
        pageTableChunkShape: pageTable.chunkShape,
        pageTableVolumeShape: pageTable.volumeShape,
        pageTableOccupiedBrickCount: pageTable.occupiedBrickCount,
        pageTableOccupiedLeafBricks: occupiedLeafBricks,
        pageTableChunkMinMax: {
          min: Math.min(...pageTable.chunkMin),
          max: Math.max(...pageTable.chunkMax)
        },
        pageTableRootOccupancy: root
          ? {
              level: root.level,
              voxels: root.occupancy.length,
              nonZero: Array.from(root.occupancy).filter((value) => value > 0).length
            }
          : null
      };
    }

    const runtimeErrors =
      ((window as Window & { __LLSM_DIAG_RUNTIME_ERRORS__?: string[] }).__LLSM_DIAG_RUNTIME_ERRORS__ ?? []).slice();
    const runtimeDiagnosticsLines = Array.from(document.querySelectorAll('.runtime-diagnostics li')).map((node) =>
      (node.textContent ?? '').trim()
    );
    return {
      hasProviderDiagnostics: providerDiagnostics !== null,
      providerDiagnostics: providerDiagnosticsSummary,
      resourceSummary,
      providerCalls,
      layerKeysFromDom,
      manifestLayerKeys,
      sampledLayer,
      runtimeErrors,
      runtimeDiagnosticsLines
    };
  });

  const collectCanvasMetrics = async () => page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('canvas'))
      .filter((canvas) => canvas.width > 16 && canvas.height > 16);
    return canvases.map((canvas, index) => {
      const gl =
        canvas.getContext('webgl2', { preserveDrawingBuffer: true }) ??
        canvas.getContext('webgl', { preserveDrawingBuffer: true });
      if (!gl) {
        return {
          index,
          width: canvas.width,
          height: canvas.height,
          hasGl: false,
          nonBlackPixels: 0,
          nonTransparentPixels: 0,
          avgLuma: 0
        };
      }
      const pixelCount = canvas.width * canvas.height;
      const pixels = new Uint8Array(pixelCount * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let nonBlackPixels = 0;
      let nonTransparentPixels = 0;
      let lumaSum = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        const r = pixels[offset] ?? 0;
        const g = pixels[offset + 1] ?? 0;
        const b = pixels[offset + 2] ?? 0;
        const a = pixels[offset + 3] ?? 0;
        if (a > 0) {
          nonTransparentPixels += 1;
        }
        const luma = r + g + b;
        lumaSum += luma;
        if (luma > 0) {
          nonBlackPixels += 1;
        }
      }
      const avgLuma = pixelCount > 0 ? lumaSum / (pixelCount * 3) : 0;
      return {
        index,
        width: canvas.width,
        height: canvas.height,
        hasGl: true,
        nonBlackPixels,
        nonTransparentPixels,
        avgLuma
      };
    });
  });
  const canvasMetrics = await collectCanvasMetrics();
  const offscreenMetrics = await page.evaluate(() => {
    const capture = (window as Window & {
      __LLSM_CAPTURE_RENDER_TARGET_METRICS__?: (() => Record<string, unknown> | null) | null;
    }).__LLSM_CAPTURE_RENDER_TARGET_METRICS__;
    return typeof capture === 'function' ? capture() : null;
  });
  const skipDisableAttempt = await page.evaluate(() => {
    const patchUniforms = (window as Window & {
      __LLSM_PATCH_VOLUME_UNIFORMS__?: ((patch: Record<string, unknown>) => number) | null;
    }).__LLSM_PATCH_VOLUME_UNIFORMS__;
    const forceRender = (window as Window & { __LLSM_FORCE_RENDER__?: (() => boolean) | null }).__LLSM_FORCE_RENDER__;
    if (typeof patchUniforms !== 'function') {
      return { available: false, updated: 0 };
    }
    const updated = patchUniforms({
      brickSkipEnabled: 0,
      adaptiveLodEnabled: 0,
      mipEarlyExitThreshold: 1,
      clim: [0, 1],
      windowMin: 0,
      windowMax: 1
    });
    if (typeof forceRender === 'function') {
      forceRender();
      forceRender();
      forceRender();
    }
    return { available: true, updated };
  });
  await page.waitForTimeout(100);
  const canvasMetricsWithSkipDisabled = await collectCanvasMetrics();
  const offscreenMetricsWithSkipDisabled = await page.evaluate(() => {
    const capture = (window as Window & {
      __LLSM_CAPTURE_RENDER_TARGET_METRICS__?: (() => Record<string, unknown> | null) | null;
    }).__LLSM_CAPTURE_RENDER_TARGET_METRICS__;
    return typeof capture === 'function' ? capture() : null;
  });
  const runtimeAfterSkipDisable = await page.evaluate(() => {
    const resourceSummaryGetter = (window as Window & { __LLSM_VOLUME_RESOURCE_SUMMARY__?: (() => unknown) | null })
      .__LLSM_VOLUME_RESOURCE_SUMMARY__;
    return typeof resourceSummaryGetter === 'function' ? resourceSummaryGetter() : null;
  });

  const pagePng = testInfo.outputPath('viewer-page.png');
  const canvasPng = testInfo.outputPath('viewer-canvas.png');
  await page.screenshot({ path: pagePng, fullPage: true });
  const firstCanvas = page.locator('canvas').first();
  await firstCanvas.screenshot({ path: canvasPng });

  console.log(`[render-diagnostic] page=${pagePng}`);
  console.log(`[render-diagnostic] canvas=${canvasPng}`);
  console.log(`[render-diagnostic] metrics=${JSON.stringify(canvasMetrics)}`);
  console.log(`[render-diagnostic] offscreenMetrics=${JSON.stringify(offscreenMetrics)}`);
  console.log(`[render-diagnostic] skipDisable=${JSON.stringify(skipDisableAttempt)}`);
  console.log(`[render-diagnostic] metricsSkipDisabled=${JSON.stringify(canvasMetricsWithSkipDisabled)}`);
  console.log(`[render-diagnostic] offscreenMetricsSkipDisabled=${JSON.stringify(offscreenMetricsWithSkipDisabled)}`);
  console.log(`[render-diagnostic] runtime=${JSON.stringify(runtimeSnapshot)}`);
  console.log(`[render-diagnostic] runtimeAfterSkipDisable=${JSON.stringify(runtimeAfterSkipDisable)}`);
  console.log(`[render-diagnostic] console=${JSON.stringify(consoleEvents)}`);
  console.log(`[render-diagnostic] pageErrors=${JSON.stringify(pageErrors)}`);
});
