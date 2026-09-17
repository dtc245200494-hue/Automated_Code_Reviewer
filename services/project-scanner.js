import path from 'path';

export const SMALL_FILE_MAX_LINES = Number.parseInt(process.env.PROJECT_SMALL_FILE_LINES || '120', 10);
export const SMALL_BATCH_MAX_LINES = Number.parseInt(process.env.PROJECT_BATCH_MAX_LINES || '400', 10);
export const MAX_CROSS_FILE_CHECKS = Number.parseInt(process.env.PROJECT_MAX_CROSS_FILE_CHECKS || '4', 10);
const PROJECT_THROTTLE_MS = Number.parseInt(process.env.PROJECT_SCAN_THROTTLE_MS || '150', 10);
const SUPPORTED_EXTENSIONS = new Set(['js','jsx','ts','tsx','html','htm','php','py','java','go','cs','sql','c','cpp','rb','sh','json','yaml','yml']);
const SKIP_RE = /(^|\/)(node_modules|dist|build|vendor|coverage|\.git|\.idea)(\/|$)|\.min\.(?:js|css)$/i;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function lineCount(content) {
  return String(content || '').split('\n').length;
}

export function filterProjectFiles(files) {
  const accepted = [];
  const skipped = [];
  for (const raw of Array.isArray(files) ? files : []) {
    const filePath = normalizePath(raw.path || raw.name);
    const ext = filePath.includes('.') ? filePath.split('.').pop().toLowerCase() : '';
    if (!filePath || SKIP_RE.test(filePath) || !SUPPORTED_EXTENSIONS.has(ext)) {
      skipped.push({ path: filePath || raw.name || 'unknown', reason: 'unsupported_or_generated' });
      continue;
    }
    accepted.push({
      name: raw.name || path.posix.basename(filePath),
      path: filePath,
      content: String(raw.content || ''),
      language: raw.language || 'auto',
      lines: lineCount(raw.content)
    });
  }
  return { accepted, skipped };
}

function resolveDependency(rawSpec, fromPath, knownPaths) {
  if (!rawSpec) return null;
  const clean = String(rawSpec).split(/[?#]/)[0].trim();
  if (!clean || /^(?:https?:|data:|\/\/)/i.test(clean)) return null;
  let candidate = clean;
  if (clean.startsWith('.')) candidate = path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), clean));
  else candidate = normalizePath(clean);
  candidate = normalizePath(candidate);
  const variants = [candidate];
  if (!path.posix.extname(candidate)) {
    variants.push(`${candidate}.js`, `${candidate}.jsx`, `${candidate}.ts`, `${candidate}.tsx`, `${candidate}.html`, `${candidate}/index.js`, `${candidate}/index.ts`);
  }
  for (const variant of variants) if (knownPaths.has(variant)) return variant;
  const suffixMatches = [...knownPaths].filter(p => variants.some(v => p.endsWith(`/${v}`) || p === v));
  return suffixMatches.length === 1 ? suffixMatches[0] : null;
}

export function buildDependencyGraph(files) {
  const known = new Set(files.map(file => file.path));
  const graph = Object.fromEntries(files.map(file => [file.path, []]));
  for (const file of files) {
    const specs = new Set();
    if (/\.(?:html?|htm)$/i.test(file.path)) {
      const scriptRe = /<script[^>]+src=["']([^"']+)["']/gi;
      let match;
      while ((match = scriptRe.exec(file.content))) specs.add(match[1]);
    }
    if (/\.(?:[cm]?js|jsx|ts|tsx)$/i.test(file.path)) {
      const importRe = /(?:import\s+(?:[^'"()]+?\s+from\s+)?|export\s+[^'"]*?\s+from\s+|require\s*\(|import\s*\()\s*["']([^"']+)["']/g;
      let match;
      while ((match = importRe.exec(file.content))) specs.add(match[1]);
    }
    for (const spec of specs) {
      const resolved = resolveDependency(spec, file.path, known);
      if (resolved && resolved !== file.path && !graph[file.path].includes(resolved)) graph[file.path].push(resolved);
    }
  }
  return graph;
}

function reverseGraph(graph) {
  const reversed = Object.fromEntries(Object.keys(graph).map(key => [key, []]));
  for (const [source, targets] of Object.entries(graph)) {
    for (const target of targets) {
      if (!reversed[target]) reversed[target] = [];
      reversed[target].push(source);
    }
  }
  return reversed;
}

function securityInterestScore(content) {
  const text = String(content || '');
  const patterns = [
    /req\.(?:query|params|body)|location\.(?:search|hash)|document\.cookie|\.value\b/i,
    /innerHTML|outerHTML|insertAdjacentHTML|document\.write|dangerouslySetInnerHTML/i,
    /\bexec(?:Sync)?\s*\(|\bspawn(?:Sync)?\s*\(|\bsystem\s*\(/i,
    /\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b/i,
    /fetch\s*\(|axios\s*\(|http\.get\s*\(|https\.get\s*\(/i,
    /api[_-]?key|password|secret|token/i
  ];
  return patterns.reduce((score, regex) => score + (regex.test(text) ? 1 : 0), 0);
}

export function buildProjectScanPlan(files, graph) {
  const byPath = new Map(files.map(file => [file.path, file]));
  const reverse = reverseGraph(graph);
  const smallPaths = new Set(files.filter(file => file.lines <= SMALL_FILE_MAX_LINES).map(file => file.path));
  const assigned = new Set();
  const plans = [];

  for (const seed of files) {
    if (!smallPaths.has(seed.path) || assigned.has(seed.path)) continue;
    const group = [seed];
    assigned.add(seed.path);
    let lines = seed.lines + 2;
    const candidates = [
      ...(graph[seed.path] || []),
      ...(reverse[seed.path] || []),
      ...files.filter(f => path.posix.dirname(f.path) === path.posix.dirname(seed.path)).map(f => f.path),
      ...files.map(f => f.path)
    ];
    for (const candidatePath of [...new Set(candidates)]) {
      if (!smallPaths.has(candidatePath) || assigned.has(candidatePath)) continue;
      const candidate = byPath.get(candidatePath);
      if (!candidate) continue;
      const nextLines = lines + candidate.lines + 2;
      if (nextLines > SMALL_BATCH_MAX_LINES || group.length >= 8) continue;
      group.push(candidate);
      assigned.add(candidatePath);
      lines = nextLines;
    }
    plans.push({ kind: group.length > 1 ? 'batch' : 'single', files: group, estimatedLines: lines });
  }

  for (const file of files) {
    if (assigned.has(file.path)) continue;
    assigned.add(file.path);
    plans.push({ kind: 'single', files: [file], estimatedLines: file.lines });
  }

  const originalOrder = new Map(files.map((file, index) => [file.path, index]));
  return plans.sort((a, b) => originalOrder.get(a.files[0].path) - originalOrder.get(b.files[0].path));
}

export function combineFilesForScan(files) {
  const lines = [];
  const ranges = [];
  for (const file of files) {
    lines.push(`// === FILE: ${file.path} ===`);
    const startLine = lines.length + 1;
    const fileLines = String(file.content || '').split('\n');
    lines.push(...fileLines);
    const endLine = lines.length;
    ranges.push({ path: file.path, startLine, endLine, originalLines: fileLines.length });
    lines.push(`// === END FILE: ${file.path} ===`);
  }
  return { code: lines.join('\n'), ranges };
}

function mapFindingToRange(vuln, ranges) {
  const explicitFile = normalizePath(vuln.file);
  let range = explicitFile ? ranges.find(item => item.path === explicitFile) : null;
  const start = Number.parseInt(vuln.start_line || vuln.line_number, 10) || 1;
  if (!range) range = ranges.find(item => start >= item.startLine && start <= item.endLine);
  if (!range) return null;
  const end = Number.parseInt(vuln.end_line || start, 10) || start;
  return {
    ...vuln,
    file: range.path,
    start_line: Math.max(1, start - range.startLine + 1),
    end_line: Math.max(1, Math.min(range.originalLines, end - range.startLine + 1)),
    line_number: Math.max(1, start - range.startLine + 1)
  };
}

function dedupeFileFindings(items) {
  const seen = new Set();
  return (items || []).filter(item => {
    const key = [item.file || '', item.type || '', item.start_line || 1, item.end_line || item.start_line || 1].join('|').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resultForBatchFile(batchResult, file, ranges) {
  const vulnerabilities = dedupeFileFindings((batchResult.vulnerabilities || [])
    .map(v => mapFindingToRange(v, ranges))
    .filter(v => v && v.file === file.path));
  return {
    ...batchResult,
    is_safe: !batchResult.incomplete && vulnerabilities.length === 0,
    vulnerabilities,
    total_lines: file.lines,
    ai_covered_lines: batchResult.incomplete ? 0 : file.lines,
    ai_coverage_percent: batchResult.incomplete ? 0 : 100,
    planned_ai_coverage_percent: 100,
    coverage_complete: !batchResult.incomplete,
    limited_coverage: Boolean(batchResult.incomplete),
    scan_strategy: 'project_small_file_batch',
    source: 'ai_project_batch',
    overall_summary: batchResult.incomplete
      ? `Batch chứa ${file.path} quét chưa hoàn tất; không thể kết luận file an toàn.`
      : vulnerabilities.length
        ? `Phát hiện ${vulnerabilities.length} nguy cơ trong ${file.path} từ batch project.`
        : `Đã quét ${file.path} trong batch project; không phát hiện finding trong file này.`
  };
}

function mergeCrossFindings(result, findings) {
  if (!result || !findings.length) return result;
  const merged = dedupeFileFindings([...(result.vulnerabilities || []), ...findings.map(v => ({ ...v, cross_file: true }))]);
  return {
    ...result,
    is_safe: result.incomplete ? false : merged.length === 0,
    vulnerabilities: merged,
    overall_summary: `${result.overall_summary || ''} Cross-file analysis bổ sung ${findings.length} finding liên quan dependency.`.trim()
  };
}

export class ProjectScannerService {
  constructor({ scanFile }) {
    if (typeof scanFile !== 'function') throw new Error('ProjectScannerService cần scanFile callback.');
    this.scanFile = scanFile;
  }

  async scanProject(rawFiles, customConfig = null) {
    const { accepted: files, skipped } = filterProjectFiles(rawFiles);
    if (!files.length) throw new Error('Không có file mã nguồn hợp lệ để quét project.');
    const graph = buildDependencyGraph(files);
    const plans = buildProjectScanPlan(files, graph);
    const results = new Map();
    const planIndex = new Map();
    let requestUnits = 0;
    let batchedGroups = 0;
    let filesBatched = 0;

    for (let planNo = 0; planNo < plans.length; planNo++) {
      const plan = plans[planNo];
      plan.files.forEach(file => planIndex.set(file.path, planNo));
      try {
        if (plan.kind === 'batch') {
          batchedGroups++;
          filesBatched += plan.files.length;
          const combined = combineFilesForScan(plan.files);
          const batchResult = await this.scanFile(combined.code, 'auto', customConfig);
          requestUnits += batchResult.chunk_count || 1;
          for (const file of plan.files) results.set(file.path, resultForBatchFile(batchResult, file, combined.ranges));
        } else {
          const file = plan.files[0];
          const result = await this.scanFile(file.content, file.language, customConfig);
          requestUnits += result.chunk_count || 1;
          result.vulnerabilities = (result.vulnerabilities || []).map(v => ({ ...v, file: file.path }));
          results.set(file.path, result);
        }
      } catch (err) {
        for (const file of plan.files) {
          results.set(file.path, {
            is_safe: false,
            incomplete: true,
            scan_status: 'incomplete',
            vulnerabilities: [],
            recommendations: [],
            overall_summary: `Quét file/project batch lỗi: ${err.message}`,
            scan_error: err.message,
            total_lines: file.lines,
            ai_covered_lines: 0,
            ai_coverage_percent: 0,
            heuristic_coverage_percent: 100,
            coverage_complete: false,
            limited_coverage: true,
            source: 'project_scan_error'
          });
        }
      }
      if (PROJECT_THROTTLE_MS > 0 && planNo < plans.length - 1) await sleep(PROJECT_THROTTLE_MS);
    }

    const byPath = new Map(files.map(file => [file.path, file]));
    const crossFindings = [];
    let crossChecks = 0;
    outer: for (const [source, targets] of Object.entries(graph)) {
      for (const target of targets) {
        if (crossChecks >= MAX_CROSS_FILE_CHECKS) break outer;
        if (planIndex.get(source) === planIndex.get(target)) continue;
        const a = byPath.get(source);
        const b = byPath.get(target);
        if (!a || !b || a.lines + b.lines + 4 > SMALL_BATCH_MAX_LINES) continue;
        if (securityInterestScore(a.content) + securityInterestScore(b.content) === 0) continue;
        const combined = combineFilesForScan([a, b]);
        const crossResult = await this.scanFile(combined.code, 'auto', customConfig);
        requestUnits += crossResult.chunk_count || 1;
        crossChecks++;
        const mapped = dedupeFileFindings((crossResult.vulnerabilities || [])
          .map(v => mapFindingToRange(v, combined.ranges))
          .filter(Boolean)
          .map(v => ({ ...v, cross_file: true, dependency_edge: `${source} -> ${target}` })));
        for (const filePath of [source, target]) {
          const additions = mapped.filter(v => v.file === filePath);
          if (additions.length) results.set(filePath, mergeCrossFindings(results.get(filePath), additions));
        }
        crossFindings.push(...mapped);
        if (PROJECT_THROTTLE_MS > 0) await sleep(PROJECT_THROTTLE_MS);
      }
    }

    const fileResults = files.map(file => ({ path: file.path, result: results.get(file.path) }));
    const allResults = fileResults.map(item => item.result).filter(Boolean);
    const incompleteFiles = allResults.filter(r => r.incomplete).length;
    const limitedCoverageFiles = allResults.filter(r => r.limited_coverage && !r.incomplete).length;
    const totalVulnerabilities = allResults.reduce((sum, r) => sum + (r.vulnerabilities?.length || 0), 0);
    const status = incompleteFiles > 0
      ? 'incomplete'
      : totalVulnerabilities > 0
        ? 'vulnerable'
        : limitedCoverageFiles > 0
          ? 'limited_coverage'
          : 'safe';

    return {
      status,
      file_results: fileResults,
      project_findings: dedupeFileFindings(crossFindings),
      dependency_graph: graph,
      skipped_files: skipped,
      stats: {
        total_input_files: Array.isArray(rawFiles) ? rawFiles.length : 0,
        scanned_files: files.length,
        skipped_files: skipped.length,
        scan_groups: plans.length,
        batched_groups: batchedGroups,
        files_batched: filesBatched,
        cross_file_checks: crossChecks,
        ai_request_units: requestUnits,
        incomplete_files: incompleteFiles,
        limited_coverage_files: limitedCoverageFiles,
        total_vulnerabilities: totalVulnerabilities
      }
    };
  }
}
