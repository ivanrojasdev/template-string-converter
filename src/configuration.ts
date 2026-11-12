
import * as vscode from 'vscode';

export interface ExtensionConfig {
  enable: boolean;
  validLanguages: string[];
  quoteType: 'single' | 'double' | 'both';
  convertOutermostQuotes: boolean;
  autoRemoveTemplateString: boolean;
  convertWithinTemplateString: boolean;
  addBracketsToProps: boolean;
}

export function getConfiguration(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('template-string-converter');

  return {
    enable: config.get<boolean>('enable', true),
    validLanguages: config.get<string[]>('validLanguages', [
      'javascript',
      'typescript',
      'javascriptreact',
      'typescriptreact',
      'svelte',
    ]),
    quoteType: config.get<'single' | 'double' | 'both'>('quoteType', 'both'),
    convertOutermostQuotes: config.get<boolean>('convertOutermostQuotes', false),
    autoRemoveTemplateString: config.get<boolean>('autoRemoveTemplateString', false),
    convertWithinTemplateString: config.get<boolean>('convertWithinTemplateString', true),
    addBracketsToProps: config.get<boolean>('addBracketsToProps', false),
  };
}
