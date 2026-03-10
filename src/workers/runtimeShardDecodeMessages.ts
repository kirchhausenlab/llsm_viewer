export type RuntimeShardDecodeRequestMessage = {
  type: 'decode-shard-entry';
  id: number;
  shardBytes: ArrayBuffer;
  byteStart: number;
  byteEnd: number;
};

export type RuntimeShardDecodeSuccessMessage = {
  type: 'decoded';
  id: number;
  bytes: ArrayBuffer;
};

export type RuntimeShardDecodeErrorMessage = {
  type: 'error';
  id: number;
  message: string;
};

export type RuntimeShardDecodeInboundMessage = RuntimeShardDecodeRequestMessage;

export type RuntimeShardDecodeOutboundMessage =
  | RuntimeShardDecodeSuccessMessage
  | RuntimeShardDecodeErrorMessage;
