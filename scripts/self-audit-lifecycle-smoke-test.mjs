import fs from 'node:fs';

const chat = fs.readFileSync('components/chat.tsx', 'utf8');
const route = fs.readFileSync('app/api/chat/route.ts', 'utf8');

const checks = [
  ['long-form diagnostic tool set exists', chat.includes('LONG_FORM_DIAGNOSTIC_TOOLS')],
  ['self-audit is treated as long-form diagnostic', chat.includes('"get_jarvis_self_audit_snapshot"') && chat.includes('isLongFormDiagnosticTool')],
  ['tool card receives assistant text context', chat.includes('assistantHasText={Boolean(messageText.trim())}')],
  ['pending diagnostic card can show answer-follows state', chat.includes('tool-card--answer-follows')],
  ['answer-follows state removes spinner', chat.includes('isPending && !showAnswerFollows')],
  ['answer-follows copy explains summarizing below', chat.includes('summarizing the result below')],
  ['self-audit prompt forbids verified-all contradiction', route.includes('never say "all capabilities are verified" if any setup/integration/configuration gaps exist')],
  ['self-audit prompt requires lifecycle explanation for delayed tool cards', route.includes('tool call started, result/summary rendering lagged')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? '✅' : '❌'} ${name}`);
if (failed.length) process.exit(1);
console.log('✅ Self-audit lifecycle smoke test passed.');
