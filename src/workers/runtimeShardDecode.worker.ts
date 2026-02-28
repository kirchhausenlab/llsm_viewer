/// <reference lib="webworker" />

import type {
  RuntimeShardDecodeInboundMessage,
  RuntimeShardDecodeOutboundMessage
} from './runtimeShardDecodeMessages';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<RuntimeShardDecodeInboundMessage>) => {
  const message = event.data;
  if (message.type !== 'decode-shard-entry') {
    return;
  }

  try {
    const fullShardBytes = new Uint8Array(message.shardBytes);
    const safeStart = Math.max(0, Math.min(fullShardBytes.byteLength, Math.floor(message.byteStart)));
    const safeEnd = Math.max(safeStart, Math.min(fullShardBytes.byteLength, Math.floor(message.byteEnd)));
    const decodedBytes = fullShardBytes.slice(safeStart, safeEnd);
    const outbound: RuntimeShardDecodeOutboundMessage = {
      type: 'decoded',
      id: message.id,
      bytes: decodedBytes.buffer
    };
    ctx.postMessage(outbound, [decodedBytes.buffer]);
  } catch (error) {
    const outbound: RuntimeShardDecodeOutboundMessage = {
      type: 'error',
      id: message.id,
      message: error instanceof Error ? error.message : 'Runtime shard decode failed.'
    };
    ctx.postMessage(outbound);
  }
};
