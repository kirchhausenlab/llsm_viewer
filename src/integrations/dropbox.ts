const DROPBOX_SCRIPT_ID = 'dropboxjs';
const DROPBOX_SCRIPT_URL = 'https://www.dropbox.com/static/api/2/dropins.js';

let dropboxLoadPromise: Promise<DropboxStatic> | null = null;

const getAppKey = () => {
  const appKey = import.meta.env.VITE_DROPBOX_APP_KEY;
  return typeof appKey === 'string' && appKey.trim().length > 0 ? appKey : null;
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

  const appKey = getAppKey();
  if (!appKey) {
    throw new Error('Dropbox app key is not configured.');
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
        reject(new Error('Dropbox chooser was closed without selecting files.'));
      }
    });
  });
}
