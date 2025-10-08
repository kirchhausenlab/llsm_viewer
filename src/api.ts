export type VolumeMetadata = {
  width: number;
  height: number;
  depth: number;
  channels: number;
  dataType: 'float32';
  voxelSize?: [number, number, number];
};

export type VolumePayload = VolumeMetadata & {
  data: ArrayBuffer;
};

export type VolumeResponse = VolumeMetadata & {
  data: string;
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
  const payload = (await response.json()) as VolumeResponse;
  const data = Uint8Array.from(atob(payload.data), (c) => c.charCodeAt(0)).buffer;
  return {
    ...payload,
    data
  };
}
