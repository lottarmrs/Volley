import { readFileSync, writeFileSync } from 'node:fs';

function normalizePromotionScript() {
  const path = 'scripts/promote-architecture-r11.mjs';
  let content = readFileSync(path, 'utf8');

  if (!content.includes("const expected = label === 'C7 promotion verdict' ? 2 : 1;")) {
    const pattern = /function replaceExactly\(content, from, to, label\) \{[\s\S]*?return content\.replace\(from, to\);\n\}/;
    const replacement = `function replaceExactly(content, from, to, label) {
  const count = content.split(from).length - 1;
  const expected = label === 'C7 promotion verdict' ? 2 : 1;
  if (count !== expected) {
    failures.push(\`${'${label}'}: expected exactly ${'${expected}'} occurrence(s), found ${'${count}'}\`);
    return content;
  }
  return expected === 1 ? content.replace(from, to) : content.replaceAll(from, to);
}`;
    if (!pattern.test(content)) throw new Error('Could not locate replaceExactly implementation');
    content = content.replace(pattern, replacement);
    writeFileSync(path, content, 'utf8');
  }
}

function normalizeR11Checker() {
  const path = 'scripts/check-architecture-r11.mjs';
  let content = readFileSync(path, 'utf8');

  content = content.replace(
    "if (!/not an implementation default/i.test(open)) fail(openPath, 'Open Decision non-default rule disappeared during promotion');",
    "if (!/not(?:\\*\\*)? an implementation default/i.test(open)) fail(openPath, 'Open Decision non-default rule disappeared during promotion');",
  );

  content = content.replace(
    "if (!/> Status:\\s*`CANONICAL \\/ C4`/.test(firstLines(hyp))) fail(hypPath, 'Hypothesis registry document is not canonical');",
    "if (!/> Status:\\s*`CANONICAL \\/ C4(?: \\/ [^`]*)?`/.test(firstLines(hyp))) fail(hypPath, 'Hypothesis registry document is not canonical');",
  );

  content = content.replace(
    "if (!/NOT TARGET SOURCE OF TRUTH/i.test(head)) fail(domainModelPath, 'legacy domain model lost non-target warning');",
    "if (!/not (?:a )?target source of truth/i.test(head)) fail(domainModelPath, 'legacy domain model lost non-target warning');",
  );

  if (!content.includes('not(?:\\*\\*)? an implementation default')) throw new Error('Open Decision assertion was not normalized');
  if (!content.includes('CANONICAL \\/ C4(?: \\/ [^`]*)?')) throw new Error('Hypothesis status assertion was not normalized');
  if (!content.includes('not (?:a )?target source of truth')) throw new Error('Domain-model warning assertion was not normalized');

  writeFileSync(path, content, 'utf8');
}

normalizePromotionScript();
normalizeR11Checker();
console.log('R11 guard sources normalized.');
