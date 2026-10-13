import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { catalog } from '../shared/i18n/catalog.ts';
import {
  localizationExemptions,
  routeIdentifiers,
} from './localization-exemptions.ts';

const problems: string[] = [];
const portuguese =
  /[áéíóúãõâêôçÁÉÍÓÚÃÕÂÊÔÇ]|\b(?:configurando|recuperando|enviada|recebida|respondeu|publicou|respostas|dias|minutos|participantes|seguidores|lida|criar|mensagens|conversas|explorar|privacidade|nome|sobre|salvos|moderador|aprovar|removido|procurar|editar|excluir|chamadas|perfil|contatos|cofre|salvar|buscar|enviar|conta|clara|teste|todos|grupos|favoritos|arquivadas|minhas|copiar)\b/iu;
const staticCatalog = new Set(
  Object.entries(catalog).flatMap(([source, pair]) => [source, ...pair]),
);
const untranslatedNames = new Set([
  '0xDMme',
  '0xDMme /',
  'Alice',
  'Bob',
  'Phantom · Solana',
  'porn',
]);

async function sourceFiles(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await sourceFiles(file)));
    else if (/\.(?:ts|html)$/u.test(file)) result.push(file);
  }
  return result;
}

function textOf(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text;
  if (!ts.isTemplateExpression(node)) return null;
  return (
    node.head.text +
    node.templateSpans
      .map((span, index) => `{${index}}${span.literal.text}`)
      .join('')
  );
}

function errorConstructor(node: ts.Node): boolean {
  return ts.isNewExpression(node) && /Error$/u.test(node.expression.getText());
}

function privateContext(node: ts.Node): boolean {
  let parent = node.parent;
  while (parent) {
    if (
      ts.isImportDeclaration(parent) ||
      ts.isLiteralTypeNode(parent) ||
      errorConstructor(parent)
    )
      return true;
    if (
      ts.isCallExpression(parent) &&
      parent.expression.getText() === 't' &&
      parent.arguments[0] === node
    )
      return true;
    parent = parent.parent;
  }
  return false;
}

function technicalIdentifier(text: string): boolean {
  return (
    routeIdentifiers.has(text) ||
    /^[#.[/]/u.test(text) ||
    /^https?:/u.test(text) ||
    /^[a-z][a-z0-9]*(?:[-_.:/?#=&][a-z0-9]*)+$/u.test(text)
  );
}

function inspect(file: string, source: string): void {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function report(node: ts.Node, reason: string): void {
    const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
    problems.push(`${file}:${line}: ${reason}`);
  }
  function checkCall(node: ts.Node): void {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 't') {
      const text = node.arguments[0] && textOf(node.arguments[0]);
      if (text !== null && text !== undefined && !Object.hasOwn(catalog, text))
        report(node, 'Missing catalog entry');
    }
  }
  function checkAuthoredText(node: ts.Node): void {
    const text = textOf(node);
    if (
      text &&
      portuguese.test(text) &&
      !privateContext(node) &&
      !technicalIdentifier(text) &&
      !localizationExemptions.get(file)?.has(text)
    )
      report(node, 'Unlocalized authored text');
  }
  function walk(node: ts.Node): void {
    checkCall(node);
    checkAuthoredText(node);
    ts.forEachChild(node, walk);
  }
  walk(ast);
}

function inspectHtml(file: string, source: string): void {
  // This is a literal-text lint, not an HTML transformer or input sanitizer.
  const authored = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, '');
  const texts = [
    ...Array.from(authored.matchAll(/>([^<]+)</gu), (match) => match[1]!),
    ...Array.from(
      authored.matchAll(
        /(?:aria-label|title|alt|placeholder|content)="([^"]+)"/gu,
      ),
      (match) => match[1]!,
    ),
  ];
  for (const text of texts) {
    const normalized = text.replace(/\s+/gu, ' ').trim();
    if (!/[A-Za-z]/u.test(normalized)) continue;
    if (staticCatalog.has(normalized) || untranslatedNames.has(normalized))
      continue;
    if (/^(?:width=|no-referrer$|docs\/)/u.test(normalized)) continue;
    problems.push(`${file}: Unlocalized static document text: ${normalized}`);
  }
}

for (const file of [
  ...(await sourceFiles('src/client')),
  ...(await sourceFiles('src/shared/wallet-recovery')),
  ...(await sourceFiles('src/shared/representatives')),
  ...(await sourceFiles('infra/moderation-collection')),
  ...(await sourceFiles('infra/moderation-evaluation')),
  'src/tools/frontend-source-document.ts',
  'src/tools/moderation-preview-document.ts',
]) {
  const source = await readFile(file, 'utf8');
  if (file.endsWith('.html')) inspectHtml(file, source);
  else inspect(file, source);
}
if (problems.length) {
  process.stderr.write(problems.join('\n') + '\n');
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Localization coverage: ${Object.keys(catalog).length} entries in English and Simplified Chinese.\n`,
  );
}
