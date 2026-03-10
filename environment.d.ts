/// <reference types="vite/client" />

declare interface ImportMetaEnv {
  readonly VITE_DROPBOX_APP_KEY?: string;
  readonly VITE_MAX_VOLUME_BYTES?: string;
  readonly VITE_PUBLIC_EXPERIMENTS_CATALOG_URL?: string;
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type DropboxLinkType = 'preview' | 'direct';

declare interface DropboxChooserFile {
  bytes: number;
  icon: string;
  id: string;
  isDir: boolean;
  link: string;
  linkType: DropboxLinkType;
  name: string;
  size: number;
  thumbnailLink?: string;
  client_modified?: string;
  server_modified?: string;
  path?: string;
  path_lower?: string;
}

declare interface DropboxChooseOptions {
  success(files: DropboxChooserFile[]): void;
  cancel?(): void;
  linkType?: DropboxLinkType;
  multiselect?: boolean;
  folderselect?: boolean;
  extensions?: string[];
}

declare interface DropboxStatic {
  choose(options: DropboxChooseOptions): void;
}

declare const Dropbox: DropboxStatic;

declare interface Window {
  Dropbox?: DropboxStatic;
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  __LLSM_VOLUME_PROVIDER__?: unknown;
  __LLSM_VOLUME_PROVIDER_DIAGNOSTICS__?: (() => unknown) | null;
  __LLSM_PREPROCESSED_MANIFEST__?: unknown;
  __LLSM_VOLUME_RESOURCE_SUMMARY__?: (() => unknown) | null;
  __LLSM_FORCE_RENDER__?: (() => boolean) | null;
  __LLSM_PATCH_VOLUME_UNIFORMS__?: (patch: {
    brickSkipEnabled?: number;
    brickAtlasEnabled?: number;
    nearestSampling?: number;
    adaptiveLodEnabled?: number;
    adaptiveLodMax?: number;
    mipEarlyExitThreshold?: number;
    windowMin?: number;
    windowMax?: number;
    renderThreshold?: number;
    renderStyle?: number;
    clim?: [number, number];
  }) => number;
  __LLSM_CAPTURE_RENDER_TARGET_METRICS__?: (() => {
    width: number;
    height: number;
    nonBlackPixels: number;
    nonTransparentPixels: number;
    avgLuma: number;
  } | null) | null;
  __LLSM_SET_CAMERA_DISTANCE__?: ((distance: number) => boolean) | null;
}
