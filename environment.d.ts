/// <reference types="vite/client" />

declare interface ImportMetaEnv {
  readonly VITE_DROPBOX_APP_KEY?: string;
  readonly VITE_MAX_VOLUME_BYTES?: string;
  readonly VITE_STREAMING_BYTE_THRESHOLD?: string;
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
}
