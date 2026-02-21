const DROPBOX_SCRIPT_ID = 'dropboxjs';
const DROPBOX_SCRIPT_URL = 'https://www.dropbox.com/static/api/2/dropins.js';
const DROPBOX_APP_KEY_STORAGE_KEY = 'llsm_viewer.dropbox_app_key';
const EMBEDDED_DROPBOX_APP_KEY = '1abfsrk62dy855r' as const;

let dropboxLoadPromise: Promise<DropboxStatic> | null = null;

export class DropboxConfigurationError extends Error {
  constructor(message = 'Dropbox app key is not configured.') {
    super(message);
    this.name = 'DropboxConfigurationError';
  }
}

export type DropboxAppKeySource = 'env' | 'local';

const getEnvAppKey = () => {
  const appKey = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env?.VITE_DROPBOX_APP_KEY;
  if (typeof appKey === 'string' && appKey.trim().length > 0) {
    return appKey.trim();
  }

  return EMBEDDED_DROPBOX_APP_KEY.trim().length > 0 ? EMBEDDED_DROPBOX_APP_KEY : null;
};

const getStoredAppKey = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(DROPBOX_APP_KEY_STORAGE_KEY);
    return stored && stored.trim().length > 0 ? stored.trim() : null;
  } catch (error) {
    console.warn('Unable to read Dropbox app key from localStorage.', error);
    return null;
  }
};

export const getDropboxAppKeyInfo = (): { appKey: string | null; source: DropboxAppKeySource | null } => {
  const envKey = getEnvAppKey();
  if (envKey) {
    return { appKey: envKey, source: 'env' };
  }

  const stored = getStoredAppKey();
  if (stored) {
    return { appKey: stored, source: 'local' };
  }

  return { appKey: null, source: null };
};

export const setDropboxAppKey = (appKey: string | null) => {
  if (typeof window === 'undefined') {
    throw new Error('Dropbox app key can only be configured in the browser.');
  }

  const trimmed = appKey?.trim() ?? '';

  try {
    if (trimmed) {
      window.localStorage.setItem(DROPBOX_APP_KEY_STORAGE_KEY, trimmed);
    } else {
      window.localStorage.removeItem(DROPBOX_APP_KEY_STORAGE_KEY);
    }
  } catch (error) {
    console.warn('Failed to persist Dropbox app key.', error);
  }

  dropboxLoadPromise = null;

  if (window.Dropbox) {
    try {
      delete window.Dropbox;
    } catch (error) {
      console.warn('Unable to clear Dropbox SDK from window.', error);
    }
  }

  if (typeof document !== 'undefined') {
    const existingScript = document.getElementById(DROPBOX_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      removeExistingScript(existingScript);
    }
  }
};

function removeExistingScript(script: HTMLScriptElement | null) {
  if (script && script.parentElement) {
    script.parentElement.removeChild(script);
  }
}

export async function ensureDropboxLoaded(): Promise<DropboxStatic> {
  if (typeof window === 'undefined') {
    throw new Error('Dropbox chooser is only available in the browser.');
  }

  if (window.Dropbox) {
    return window.Dropbox;
  }

  if (dropboxLoadPromise) {
    return dropboxLoadPromise;
  }

  const { appKey } = getDropboxAppKeyInfo();
  if (!appKey) {
    throw new DropboxConfigurationError();
  }

  const existingScript = document.getElementById(DROPBOX_SCRIPT_ID) as HTMLScriptElement | null;
  if (existingScript) {
    removeExistingScript(existingScript);
  }

  dropboxLoadPromise = new Promise<DropboxStatic>((resolve, reject) => {
    const script = document.createElement('script');
    script.id = DROPBOX_SCRIPT_ID;
    script.type = 'text/javascript';
    script.async = true;
    script.src = `${DROPBOX_SCRIPT_URL}`;
    script.dataset.appKey = appKey;

    script.onload = () => {
      if (window.Dropbox) {
        resolve(window.Dropbox);
      } else {
        dropboxLoadPromise = null;
        removeExistingScript(script);
        reject(new Error('Dropbox SDK loaded but Dropbox object is unavailable.'));
      }
    };

    script.onerror = () => {
      dropboxLoadPromise = null;
      removeExistingScript(script);
      reject(new Error('Failed to load the Dropbox Dropins script.'));
    };

    document.head.appendChild(script);
  });

  return dropboxLoadPromise;
}

async function convertSelectionToFile(selection: DropboxChooserFile): Promise<File> {
  if (selection.isDir) {
    throw new Error(`Dropbox selection "${selection.name}" is a directory and cannot be imported.`);
  }

  if (!selection.link) {
    throw new Error(`Dropbox selection "${selection.name}" does not have a downloadable link.`);
  }

  const response = await fetch(selection.link);
  if (!response.ok) {
    throw new Error(`Failed to download \"${selection.name}\" from Dropbox (status ${response.status}).`);
  }

  const blob = await response.blob();
  const lastModified = selection.client_modified ? Date.parse(selection.client_modified) : Date.now();
  const file = new File([blob], selection.name, {
    type: blob.type || 'application/octet-stream',
    lastModified: Number.isNaN(lastModified) ? Date.now() : lastModified
  });

  const relativePath = selection.path_lower ? selection.path_lower.replace(/^\//, '') : selection.name;
  try {
    Object.defineProperty(file, 'webkitRelativePath', {
      value: relativePath,
      configurable: true
    });
  } catch (error) {
    (file as File & { webkitRelativePath?: string }).webkitRelativePath = relativePath;
  }

  return file;
}

export type DropboxChooserRequestOptions = Omit<DropboxChooseOptions, 'success' | 'cancel' | 'linkType'>;

export async function chooseDropboxFiles(options: DropboxChooserRequestOptions): Promise<File[]> {
  const dropbox = await ensureDropboxLoaded();

  return new Promise<File[]>((resolve, reject) => {
    dropbox.choose({
      ...options,
      linkType: 'direct',
      success: async (selections) => {
        try {
          const files = await Promise.all(selections.map((selection) => convertSelectionToFile(selection)));
          resolve(files);
        } catch (error) {
          reject(error instanceof Error ? error : new Error('Failed to convert Dropbox selections to files.'));
        }
      },
      cancel: () => {
        resolve([]);
      }
    });
  });
}
