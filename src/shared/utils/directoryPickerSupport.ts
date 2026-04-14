type DirectoryPickerWindowLike = {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  isSecureContext?: boolean;
  self?: unknown;
  top?: unknown;
};

export type DirectoryPickerSupport =
  | { supported: true }
  | {
      supported: false;
      reason: 'missing-window' | 'insecure-context' | 'embedded-context' | 'api-missing';
    };

export function inspectDirectoryPickerSupport(
  target: DirectoryPickerWindowLike | null = typeof window !== 'undefined' ? window : null
): DirectoryPickerSupport {
  if (!target) {
    return { supported: false, reason: 'missing-window' };
  }

  if (typeof target.showDirectoryPicker === 'function') {
    return { supported: true };
  }

  if (target.isSecureContext === false) {
    return { supported: false, reason: 'insecure-context' };
  }

  try {
    if (target.top && target.self && target.top !== target.self) {
      return { supported: false, reason: 'embedded-context' };
    }
  } catch {
    return { supported: false, reason: 'embedded-context' };
  }

  return { supported: false, reason: 'api-missing' };
}

export function getDirectoryPickerUnavailableMessage(
  support: DirectoryPickerSupport = inspectDirectoryPickerSupport(),
  options?: { feature?: string }
): string {
  const feature = options?.feature ?? 'Folder selection';
  if (support.supported) {
    return `${feature} is available.`;
  }
  switch (support.reason) {
    case 'missing-window':
      return `${feature} is unavailable in this environment.`;
    case 'insecure-context':
      return `${feature} is unavailable because this page is not running in a secure context. In Chrome, open the app from https:// or http://localhost.`;
    case 'embedded-context':
      return `${feature} is unavailable because this page is running inside an embedded browser context. Open the app directly in a top-level Chrome tab.`;
    case 'api-missing':
      return `${feature} is unavailable because this page context did not expose the File System Access API.`;
  }
}
