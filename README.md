
# Template String Converter

Automatically converts strings to template literals when typing `${}`.

## Features

- Automatically converts single-quoted strings to template literals.
- Automatically converts double-quoted strings to template literals.
- Supports JavaScript and TypeScript.
- Supports JSX, TSX, and Svelte.
- Configurable quotation mark preferences.

## Configuration

You can customize the extension through VS Code settings.

| Setting | Description | Default |
|---|---|---|
| `template-string-converter.enable` | Enable or disable the extension. | `true` |
| `template-string-converter.validLanguages` | Languages where the extension is active. | JavaScript, TypeScript, JSX, TSX, Svelte |
| `template-string-converter.quoteType` | Choose which quotation marks should be converted. | `both` |
| `template-string-converter.convertOutermostQuotes` | Convert the outermost quotes in nested strings. | `false` |
| `template-string-converter.autoRemoveTemplateString` | Automatically revert template literals when interpolation is removed. | `false` |
| `template-string-converter.convertWithinTemplateString` | Allow conversion inside existing template literals. | `true` |
| `template-string-converter.addBracketsToProps` | Add JSX expression brackets around template literals in properties. | `false` |

## Usage

Type `${` inside a single-quoted or double-quoted string.

**Before:**

```typescript
const name = "Hello ${
```

**After:**

```typescript
const name = `Hello ${
```

## License

MIT
