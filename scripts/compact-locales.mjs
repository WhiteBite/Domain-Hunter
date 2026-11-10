/** Losslessly share English dictionary keys at browser build time only. */
import ts from 'typescript';

function entries(source, name) {
  const file = ts.createSourceFile(`${name}.ts`, source, ts.ScriptTarget.Latest, true);
  if (file.parseDiagnostics.length || file.statements.some((s) =>
    !ts.isVariableStatement(s) && !(ts.isImportDeclaration(s) && s.importClause?.isTypeOnly))) return null;
  const statements = file.statements.filter(ts.isVariableStatement);
  if (statements.length !== 1 || !statements[0].modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) || statements[0].declarationList.declarations.length !== 1) return null;
  const decl = statements[0].declarationList.declarations[0];
  if (!ts.isIdentifier(decl.name) || decl.name.text !== name) return null;
  if (!decl?.initializer || !ts.isObjectLiteralExpression(decl.initializer)) return null;
  const result = new Map();
  for (const property of decl.initializer.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.name) || !ts.isStringLiteral(property.initializer) || property.name.text === '__proto__' || result.has(property.name.text)) return null;
    result.set(property.name.text, property.initializer.text);
  }
  return result;
}

export function compactLocale(source, english, name) {
  if (!/^(ru|es|de|pt|zh|ja|fr)$/.test(name)) return null;
  const keys = entries(english, 'en');
  const dict = entries(source, name);
  if (!keys || !dict || keys.size !== dict.size) return null;
  const localeKeys = [...dict.keys()];
  if ([...keys.keys()].some((key, i) => localeKeys[i] !== key || /^(0|[1-9]\d*)$/.test(key))) return null;
  const values = JSON.stringify([...keys.keys()].map((key) => dict.get(key))).replace(/</g, '\\u003c');
  return `import { en } from './en'; const values=${values}; export const ${name}=Object.fromEntries(Object.keys(en).map((key,i)=>[key,values[i]]));`;
}
