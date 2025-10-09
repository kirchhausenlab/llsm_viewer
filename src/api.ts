export type VolumeMetadata = {
  width: number;
  height: number;
  depth: number;
  channels: number;
  dataType: 'float32';
  voxelSize?: [number, number, number];
  min: number;
  max: number;
};

export type VolumePayload = VolumeMetadata & {
  data: ArrayBuffer;
};

async function handleResponse(response: Response) {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return response;
}

export async function listTiffFiles(path: string): Promise<string[]> {
  const response = await handleResponse(
    await fetch('/api/list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path })
    })
  );
  const payload = (await response.json()) as { files: string[] };
  return payload.files;
}

export async function loadVolume(path: string, filename: string): Promise<VolumePayload> {
  const response = await handleResponse(
    await fetch('/api/volume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path, filename })
    })
  );

  const metadataHeader = response.headers.get('x-volume-metadata');
  if (!metadataHeader) {
    throw new Error('Volume metadata is missing from the response.');
  }

  let metadata: VolumeMetadata;
  try {
    metadata = JSON.parse(metadataHeader) as VolumeMetadata;
  } catch (error) {
    console.error('Failed to parse volume metadata header', error);
    throw new Error('Received malformed volume metadata.');
  }

  const data = await response.arrayBuffer();
  return {
    ...metadata,
    data
  };
}
