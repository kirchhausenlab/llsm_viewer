import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = process.cwd();
const SRC_ROOT = path.join(PROJECT_ROOT, 'src');
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
const RULES = [
  {
    scope: /^src\/hooks\/.+\.(ts|tsx)$/,
    forbidden: /^src\/components\//,
    message: 'Hooks must not import from components. Move shared types or policies into neutral modules.'
  },
  {
    scope: /^src\/ui\/app\/hooks\/.+\.(ts|tsx)$/,
    forbidden: /^src\/components\//,
    message: 'App hooks must not import from components. Use ui contracts or view-model modules instead.'
  }
];

function collectFiles(rootDir) {
  const files = [];
  const visit = (currentDir) => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const resolvedPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(resolvedPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (!SOURCE_EXTENSIONS.includes(path.extname(entry.name))) {
        continue;
      }
      files.push(resolvedPath);
    }
  };

  visit(rootDir);
  return files;
}

function normalizeProjectRelative(filePath) {
  return path.relative(PROJECT_ROOT, filePath).split(path.sep).join('/');
}

function resolveImportTarget(sourceFile, specifier) {
  if (specifier.startsWith('@/')) {
    return path.join(SRC_ROOT, specifier.slice(2));
  }
  if (!specifier.startsWith('.')) {
    return null;
  }

  const basePath = path.resolve(path.dirname(sourceFile), specifier);
  const candidates = [
    basePath,
    ...SOURCE_EXTENSIONS.map((extension) => `${basePath}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => path.join(basePath, `index${extension}`))
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return basePath;
}

function collectImports(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const importPattern = /\b(?:import|export)\b[\s\S]*?\bfrom\s+['"]([^'"]+)['"]/g;
  const imports = [];
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier) {
      continue;
    }
    imports.push(specifier);
  }
  return imports;
}

const violations = [];
const files = collectFiles(SRC_ROOT);

for (const filePath of files) {
  const sourceRelative = normalizeProjectRelative(filePath);
  const matchingRules = RULES.filter((rule) => rule.scope.test(sourceRelative));
  if (matchingRules.length === 0) {
    continue;
  }

  for (const specifier of collectImports(filePath)) {
    const resolved = resolveImportTarget(filePath, specifier);
    if (!resolved) {
      continue;
    }
    const targetRelative = normalizeProjectRelative(resolved);
    for (const rule of matchingRules) {
      if (!rule.forbidden.test(targetRelative)) {
        continue;
      }
      violations.push(`${sourceRelative} -> ${targetRelative}: ${rule.message}`);
    }
  }
}

if (violations.length > 0) {
  console.error('Import boundary violations detected:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('Import boundaries OK.');
