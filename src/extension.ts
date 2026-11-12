import * as vscode from 'vscode';
import { getConfiguration } from './configuration';

interface StringRange {
  start: number; // índice de la comilla de apertura (en la línea)
  end: number;   // índice de la comilla de cierre (en la línea)
  quote: string;
}

/**
 * Busca el string (', " o `) de la línea que contiene la columna dada.
 * Con `inclusive = true` también acepta el cursor justo antes de la comilla de cierre.
 */
function findStringAt(
  lineText: string,
  col: number,
  inclusive = false,
): StringRange | null {
  let quote: string | null = null;
  let start = -1;

  for (let i = 0; i < lineText.length; i++) {
    const ch = lineText[i];

    if (quote) {
      if (ch === '\\') {
        i++; // salta el carácter escapado
        continue;
      }
      if (ch === quote) {
        const inside = inclusive ? col > start && col <= i : col > start && col < i;
        if (inside) {
          return { start, end: i, quote };
        }
        quote = null;
      }
    } else if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      start = i;
    }
  }

  // String sin cerrar: no hacemos nada
  return null;
}

const escapeTemplate = (s: string) => s.replace(/`/g, '\\`');

/** Convierte el contenido de un template (sin ${}) a contenido de string normal. */
function unescapeTemplate(s: string, quote: string, escapeQuote: boolean): string {
  let result = s.replace(/\\`/g, '`');
  if (escapeQuote) {
    const re = quote === "'" ? /(?<!\\)'/g : /(?<!\\)"/g;
    result = result.replace(re, '\\' + quote);
  }
  return result;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function activate(context: vscode.ExtensionContext) {
  let isApplyingSnippet = false;
  const log = (...args: unknown[]) => console.log('[template-literal]', ...args);

  // Copia del texto anterior de cada documento: permite saber qué se borró
  const snapshots = new Map<string, string>();
  const keyOf = (doc: vscode.TextDocument) => doc.uri.toString();

  vscode.workspace.textDocuments.forEach((doc) =>
    snapshots.set(keyOf(doc), doc.getText()),
  );

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) =>
      snapshots.set(keyOf(doc), doc.getText()),
    ),
    vscode.workspace.onDidCloseTextDocument((doc) => snapshots.delete(keyOf(doc))),
  );

  /** String normal -> template literal (al escribir "${"). */
  async function convertToTemplate(
    editor: vscode.TextEditor,
    document: vscode.TextDocument,
  ) {
    const config = getConfiguration();

    // Dejar que VS Code termine el autocierre y mueva el cursor
    await wait(30);

    const cursor = editor.selection.active;
    const line = document.lineAt(cursor.line);
    const lineText = line.text;
    const braceCol = cursor.character - 1; // el "{" queda justo antes del cursor
    const dollarCol = braceCol - 1;

    log('line:', JSON.stringify(lineText), 'cursor:', cursor.character);

    if (braceCol < 1 || lineText[braceCol] !== '{' || lineText[dollarCol] !== '$') {
      return log('no "${" before cursor');
    }

    const str = findStringAt(lineText, dollarCol);
    if (!str) return log('no string found around $');
    if (str.quote === '`') return log('already a template literal');

    const isJsx =
      document.languageId === 'javascriptreact' ||
      document.languageId === 'typescriptreact';

    const textBeforeQuote = lineText.slice(0, str.start);

    // ¿Es un atributo JSX? (nombre=" ...) y no una asignación tipo `const x = "..."`
    const isJsxAttribute =
      isJsx &&
      /(^|[\s<])[A-Za-z_][\w:-]*\s*=\s*$/.test(textBeforeQuote) &&
      !/\b(const|let|var)\s+[\w$]+(\s*:\s*[^=]+)?\s*=\s*$/.test(textBeforeQuote) &&
      !/[=!]=\s*$/.test(textBeforeQuote);

    // En atributos JSX se aceptan ambas comillas; en el resto se respeta la config
    if (!isJsxAttribute) {
      if (
        (config.quoteType === 'single' && str.quote !== "'") ||
        (config.quoteType === 'double' && str.quote !== '"')
      ) {
        return log('quote type not allowed by config', str.quote);
      }
    }

    const hasAutoClosingBrace = lineText[braceCol + 1] === '}';

    const contentBefore = escapeTemplate(lineText.slice(str.start + 1, dollarCol));
    const contentAfter = escapeTemplate(
      lineText.slice(braceCol + (hasAutoClosingBrace ? 2 : 1), str.end),
    );

    const range = new vscode.Range(
      new vscode.Position(line.lineNumber, str.start),
      new vscode.Position(line.lineNumber, str.end + 1),
    );

    const prefix = isJsxAttribute ? '{`' : '`';
    const suffix = isJsxAttribute ? '`}' : '`';
    const newText = prefix + contentBefore + '${}' + contentAfter + suffix;
    const cursorCol = str.start + prefix.length + contentBefore.length + 2;

    try {
      isApplyingSnippet = true;

      const ok = await editor.edit(
        (editBuilder) => editBuilder.replace(range, newText),
        { undoStopBefore: true, undoStopAfter: true },
      );

      log('edit applied:', ok);

      if (ok) {
        const pos = new vscode.Position(line.lineNumber, cursorCol);
        editor.selection = new vscode.Selection(pos, pos);
      }
    } finally {
      isApplyingSnippet = false;
    }
  }

  /** Template literal sin ${} -> string normal (al borrar "${...}"). */
  async function revertToString(
    editor: vscode.TextEditor,
    document: vscode.TextDocument,
  ) {
    const config = getConfiguration();

    // Dejar que VS Code termine de borrar el par "}" y mueva el cursor
    await wait(30);

    const cursor = editor.selection.active;
    const line = document.lineAt(cursor.line);
    const lineText = line.text;

    const str = findStringAt(lineText, cursor.character, true);
    if (!str) return log('revert: no string around cursor');
    if (str.quote !== '`') return log('revert: not a template literal');

    const content = lineText.slice(str.start + 1, str.end);
    if (content.includes('${')) return log('revert: still has expressions');

    const before = lineText.slice(0, str.start);
    const after = lineText.slice(str.end + 1);

    // Tagged template (css`...`, sql`...`, fn`...`): no se toca
    if (/[\w$)\]]$/.test(before)) return log('revert: tagged template');

    const isJsx =
      document.languageId === 'javascriptreact' ||
      document.languageId === 'typescriptreact';

    // ¿Es className={`...`} (atributo JSX envuelto en llaves)?
    const openBraceMatch = /\{\s*$/.exec(before);
    const closeBraceMatch = /^\s*\}/.exec(after);
    const isWrappedAttribute =
      isJsx &&
      !!openBraceMatch &&
      !!closeBraceMatch &&
      /(^|[\s<])[A-Za-z_][\w:-]*\s*=\s*\{\s*$/.test(before);

    let quote: string;
    let escapeQuote: boolean;
    let replaceStart: number;
    let replaceEnd: number;

    if (isWrappedAttribute) {
      // En atributos JSX no existen escapes: si hay "\" o ambas comillas, no revertimos
      if (content.includes('\\')) return log('revert: backslash in JSX attribute');
      if (!content.includes('"')) quote = '"';
      else if (!content.includes("'")) quote = "'";
      else return log('revert: both quotes in JSX attribute');

      escapeQuote = false;
      replaceStart = openBraceMatch!.index; // posición del "{"
      replaceEnd = str.end + 1 + closeBraceMatch![0].length; // después del "}"
    } else {
      quote = config.quoteType === 'double' ? '"' : "'";
      escapeQuote = true;
      replaceStart = str.start;
      replaceEnd = str.end + 1;
    }

    const newBody = unescapeTemplate(content, quote, escapeQuote);
    const newText = quote + newBody + quote;

    // Recolocar el cursor dentro del nuevo string
    const offsetInContent = Math.min(
      Math.max(cursor.character - (str.start + 1), 0),
      content.length,
    );
    const convertedPrefix = unescapeTemplate(
      content.slice(0, offsetInContent),
      quote,
      escapeQuote,
    );
    const cursorCol = replaceStart + 1 + convertedPrefix.length;

    const range = new vscode.Range(
      new vscode.Position(line.lineNumber, replaceStart),
      new vscode.Position(line.lineNumber, replaceEnd),
    );

    try {
      isApplyingSnippet = true;

      const ok = await editor.edit(
        (editBuilder) => editBuilder.replace(range, newText),
        { undoStopBefore: true, undoStopAfter: true },
      );

      log('revert applied:', ok, JSON.stringify(newText));

      if (ok) {
        const pos = new vscode.Position(line.lineNumber, cursorCol);
        editor.selection = new vscode.Selection(pos, pos);
      }
    } finally {
      isApplyingSnippet = false;
    }
  }

  const disposable = vscode.workspace.onDidChangeTextDocument(async (event) => {
    const document = event.document;
    const key = keyOf(document);

    // Se actualiza siempre (también con nuestras propias ediciones)
    const previousText = snapshots.get(key);
    snapshots.set(key, document.getText());

    if (isApplyingSnippet) return;
    if (event.contentChanges.length === 0) return;

    const typedBrace = event.contentChanges.some((c) => c.text.includes('{'));

    // ¿Se borró (o reemplazó) algún "$", "{" o "}"?
    const deletedSyntax =
      previousText !== undefined &&
      event.contentChanges.some(
        (c) =>
          c.rangeLength > 0 &&
          /[${}]/.test(previousText.substr(c.rangeOffset, c.rangeLength)),
      );

    if (!typedBrace && !deletedSyntax) return;

    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) return log('no active editor');

    const config = getConfiguration();
    if (!config.enable) return log('disabled');

    if (!config.validLanguages.includes(document.languageId)) {
      return log('language not valid', document.languageId);
    }

    if (typedBrace) {
      await convertToTemplate(editor, document);
    } else {
      await revertToString(editor, document);
    }
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}