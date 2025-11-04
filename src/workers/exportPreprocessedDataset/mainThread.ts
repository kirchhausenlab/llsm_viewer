import {
  exportPreprocessedDataset,
  type ExportPreprocessedDatasetOptions,
  type PreprocessedManifest
} from '../../utils/preprocessedDataset';
import { cloneUint8Array } from '../../utils/buffer';

export type ExportPreprocessedDatasetStreamResult = {
  manifest: PreprocessedManifest;
  stream: ReadableStream<Uint8Array>;
};

export type Uint8StreamController = {
  enqueue(chunk: Uint8Array): void;
  close(): void;
  error(error?: unknown): void;
};

type BufferedStreamState = {
  controller: Uint8StreamController | null;
  bufferedChunks: Uint8Array[];
  isCancelled: boolean;
};

export type BufferedUint8Stream = {
  stream: ReadableStream<Uint8Array>;
  enqueue(chunk: Uint8Array): void;
  close(): void;
  error(error: unknown): void;
  isCancelled(): boolean;
};

export function createBufferedUint8Stream(): BufferedUint8Stream {
  const state: BufferedStreamState = {
    controller: null,
    bufferedChunks: [],
    isCancelled: false
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller: Uint8StreamController) {
      if (state.isCancelled) {
        state.controller = null;
        return;
      }
      state.controller = controller;
      if (state.bufferedChunks.length > 0) {
        for (const chunk of state.bufferedChunks) {
          controller.enqueue(chunk);
        }
        state.bufferedChunks.length = 0;
      }
    },
    cancel() {
      state.isCancelled = true;
      state.controller = null;
      state.bufferedChunks.length = 0;
    }
  });

  const clearBufferedChunks = () => {
    state.controller = null;
    if (state.bufferedChunks.length > 0) {
      state.bufferedChunks.length = 0;
    }
  };

  return {
    stream,
    enqueue(chunk: Uint8Array) {
      if (state.isCancelled) {
        return;
      }
      if (state.controller) {
        state.controller.enqueue(chunk);
      } else {
        state.bufferedChunks.push(chunk);
      }
    },
    close() {
      if (!state.isCancelled && state.controller) {
        state.controller.close();
      }
      clearBufferedChunks();
    },
    error(error: unknown) {
      if (!state.isCancelled && state.controller) {
        state.controller.error(error);
      }
      clearBufferedChunks();
    },
    isCancelled() {
      return state.isCancelled;
    }
  };
}

export async function exportPreprocessedDatasetOnMainThread(
  options: ExportPreprocessedDatasetOptions
): Promise<ExportPreprocessedDatasetStreamResult> {
  const bufferedStream = createBufferedUint8Stream();

  try {
    const { manifest } = await exportPreprocessedDataset(options, (chunk) => {
      if (!bufferedStream.isCancelled()) {
        bufferedStream.enqueue(cloneUint8Array(chunk));
      }
    });

    bufferedStream.close();
    return { manifest, stream: bufferedStream.stream };
  } catch (error) {
    bufferedStream.error(error);
    throw error;
  }
}
