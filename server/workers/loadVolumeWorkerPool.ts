import { Worker, type WorkerOptions } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type {
  LoadVolumeErrorMessage,
  LoadVolumeRequestMessage,
  LoadVolumeSuccessMessage,
  LoadVolumeWorkerResponse,
  VolumeMetadata
} from './types';

export class LoadVolumeWorkerError extends Error {
  public readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'LoadVolumeWorkerError';
    this.statusCode = statusCode;
  }
}

interface LoadVolumeJob {
  id: number;
  directoryPath: string;
  filename: string;
  resolve: (value: LoadVolumeJobResult) => void;
  reject: (reason: unknown) => void;
}

export interface LoadVolumeJobResult {
  metadata: VolumeMetadata;
  buffer: Buffer;
}

export class LoadVolumeWorkerPool {
  private readonly workers = new Set<Worker>();
  private readonly idleWorkers: Worker[] = [];
  private readonly jobQueue: LoadVolumeJob[] = [];
  private readonly activeJobs = new Map<Worker, LoadVolumeJob>();
  private nextJobId = 0;
  private destroyed = false;
  private readonly workerScript: URL;
  private readonly workerExecArgv: string[] | undefined;
  private readonly poolSize: number;
  private readonly geotiffPoolSize: number;

  constructor(size: number, options: { geotiffPoolSize?: number } = {}) {
    this.poolSize = Math.max(1, size);
    this.geotiffPoolSize = Math.max(1, options.geotiffPoolSize ?? 1);
    const runningFile = fileURLToPath(import.meta.url);
    const isTypeScript = runningFile.endsWith('.ts');
    const workerFilename = isTypeScript ? 'loadVolumeWorker.ts' : 'loadVolumeWorker.js';
    this.workerScript = new URL(workerFilename, import.meta.url);

    if (isTypeScript) {
      const execArgv = [...process.execArgv];
      const hasTsLoader = execArgv.some((arg) => arg.includes('tsx') || arg.includes('ts-node'));
      if (!hasTsLoader) {
        execArgv.push('--loader', 'tsx/esm');
      }
      this.workerExecArgv = execArgv;
    }

    for (let index = 0; index < this.poolSize; index++) {
      this.createWorker();
    }
  }

  private createWorker() {
    if (this.destroyed) {
      return;
    }

    const workerUrl = this.workerScript;
    const options: WorkerOptions = {
      workerData: {
        poolSize: this.geotiffPoolSize
      }
    };
    if (this.workerExecArgv) {
      options.execArgv = this.workerExecArgv;
    }

    const worker = new Worker(workerUrl, options);
    this.workers.add(worker);
    this.idleWorkers.push(worker);

    worker.on('message', (message: LoadVolumeWorkerResponse) => {
      this.handleMessage(worker, message);
    });
    worker.on('error', (error) => {
      this.handleWorkerError(worker, error);
    });
    worker.on('exit', (code) => {
      this.handleWorkerExit(worker, code);
    });

    this.dispatch();
  }

  private handleMessage(worker: Worker, message: LoadVolumeWorkerResponse) {
    const job = this.activeJobs.get(worker);
    if (!job) {
      return;
    }

    this.activeJobs.delete(worker);
    if (!this.destroyed) {
      this.idleWorkers.push(worker);
    }

    if (message.ok) {
      const { metadata, buffer } = message as LoadVolumeSuccessMessage;
      const nodeBuffer = Buffer.from(buffer);
      job.resolve({ metadata, buffer: nodeBuffer });
    } else {
      const { error } = message as LoadVolumeErrorMessage;
      job.reject(new LoadVolumeWorkerError(error.message, error.statusCode));
    }

    this.dispatch();
  }

  private handleWorkerError(worker: Worker, error: Error) {
    const job = this.activeJobs.get(worker);
    if (job) {
      job.reject(error);
      this.activeJobs.delete(worker);
    }
    this.removeWorker(worker);
    if (!this.destroyed) {
      this.createWorker();
    }
    this.dispatch();
  }

  private handleWorkerExit(worker: Worker, code: number) {
    const job = this.activeJobs.get(worker);
    if (job) {
      const message = code === 0 ? 'Worker exited unexpectedly.' : `Worker exited with code ${code}.`;
      job.reject(new Error(message));
      this.activeJobs.delete(worker);
    }
    this.removeWorker(worker);
    if (!this.destroyed) {
      this.createWorker();
    }
    this.dispatch();
  }

  private removeWorker(worker: Worker) {
    this.workers.delete(worker);
    const idleIndex = this.idleWorkers.indexOf(worker);
    if (idleIndex !== -1) {
      this.idleWorkers.splice(idleIndex, 1);
    }
  }

  private dispatch() {
    if (this.destroyed) {
      return;
    }

    while (this.idleWorkers.length > 0 && this.jobQueue.length > 0) {
      const worker = this.idleWorkers.shift();
      const job = this.jobQueue.shift();
      if (!worker || !job) {
        break;
      }

      this.activeJobs.set(worker, job);
      const message: LoadVolumeRequestMessage = {
        id: job.id,
        directoryPath: job.directoryPath,
        filename: job.filename
      };
      worker.postMessage(message);
    }
  }

  public async destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;

    for (const job of this.jobQueue) {
      job.reject(new LoadVolumeWorkerError('Worker pool destroyed.'));
    }
    this.jobQueue.length = 0;

    this.activeJobs.forEach((job, worker) => {
      job.reject(new LoadVolumeWorkerError('Worker pool destroyed.'));
      this.activeJobs.delete(worker);
    });

    await Promise.allSettled(
      Array.from(this.workers.values()).map((worker) => worker.terminate())
    );

    this.workers.clear();
    this.idleWorkers.length = 0;
  }

  public schedule(directoryPath: string, filename: string): Promise<LoadVolumeJobResult> {
    if (this.destroyed) {
      return Promise.reject(new LoadVolumeWorkerError('Worker pool destroyed.'));
    }

    return new Promise<LoadVolumeJobResult>((resolve, reject) => {
      const job: LoadVolumeJob = {
        id: this.nextJobId++,
        directoryPath: path.resolve(directoryPath),
        filename,
        resolve,
        reject
      };
      this.jobQueue.push(job);
      this.dispatch();
    });
  }
}
