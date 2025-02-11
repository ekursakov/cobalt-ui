import type {
  BuildResult,
  GradientStop,
  ParsedColorToken,
  ParsedCubicBezierToken,
  ParsedDimensionToken,
  ParsedDurationToken,
  ParsedFontToken,
  ParsedGradientToken,
  ParsedLinkToken,
  ParsedShadowToken,
  ParsedToken,
  ParsedTransitionToken,
  ParsedTypographyToken,
  Plugin,
  ResolvedConfig,
} from '@cobalt-ui/core';

import {Indenter} from '@cobalt-ui/utils';
import {encode, formatFontNames} from './util.js';

const CAMELCASE_RE = /([^A-Z])([A-Z])/g;
const VAR_TOKENS = '__token-values';
const VAR_TYPOGRAPHY = '__token-typography-mixins';
const VAR_ERROR = '__cobalt-error';
const TRAILING_WS_RE = /\s+$/gm;
const DEPENDENCIES = ['sass:list', 'sass:map'];

export interface Options {
  /** output file (default: "./tokens/index.sass") */
  filename?: string;
  /** use indented syntax (.sass)? (default: false) */
  indentedSyntax?: boolean;
  /** embed files in CSS? */
  embedFiles?: boolean;
  /** handle different token types */
  transform?: (token: ParsedToken, mode?: string) => string;
}

export default function sass(options?: Options): Plugin {
  let config: ResolvedConfig;
  let ext = options?.indentedSyntax ? '.sass' : '.scss';
  let filename = `${options?.filename?.replace(/(\.(sass|scss))?$/, '') || 'index'}${ext}`;

  const semi = options?.indentedSyntax ? '' : ';';
  const cbOpen = options?.indentedSyntax ? '' : ' {';
  const cbClose = options?.indentedSyntax ? '' : '} ';
  const i = new Indenter();

  const TOKEN_FN = `@function token($tokenName, $modeName: default)${cbOpen}
  @if map.has-key($${VAR_TOKENS}, $tokenName) == false${cbOpen}
    @error "No token named \\"#{$tokenName}\\""${semi}
  ${cbClose}
  $_token: map.get($${VAR_TOKENS}, $tokenName)${semi}
  @if map.has-key($_token, "__cobalt-error")${cbOpen}
    @error map.get($_token, "__cobalt-error")${semi}
  ${cbClose}
  @if map.has-key($_token, $modeName) {
    @return map.get($_token, $modeName)${semi}
  ${cbClose}@else${cbOpen}
    @return map.get($_token, default)${semi}
  ${cbClose}
${cbClose}`
    .trim()
    .replace(TRAILING_WS_RE, '');

  const LIST_MODES_FN = `@function listModes($tokenName)${cbOpen}
  @if map.has-key($${VAR_TOKENS}, $tokenName) == false${cbOpen}
    @error "No token named \\"#{$tokenName}\\""${semi}
  ${cbClose}
  $_modes: ();
  @each $k in map.get($${VAR_TOKENS}, $tokenName)${cbOpen}
    @if $k != "default"${cbOpen}
      $_modes: list.append($_modes, $k);
    ${cbClose}
  ${cbClose}
  @return $_modes;
${cbClose}`
    .trim()
    .replace(TRAILING_WS_RE, '');

  const TYPOGRAPHY_MIXIN = `@mixin typography($tokenName, $modeName: default)${cbOpen}
  @if map.has-key($${VAR_TYPOGRAPHY}, $tokenName) == false${cbOpen}
    @error "No typography mixin named \\"#{$tokenName}\\""${semi}
  ${cbClose}
  $_mixin: map.get($${VAR_TYPOGRAPHY}, $tokenName)${semi}
  $_properties: map.get($_mixin, default)${semi}
  @if map.has-key($_mixin, $modeName)${cbOpen}
    $_properties: map.get($_mixin, $modeName)${semi}
  ${cbClose}
  @each $_property, $_value in $_properties${cbOpen}
    #{$_property}: #{$_value}${semi}
  ${cbClose}
${cbClose}`
    .trim()
    .replace(TRAILING_WS_RE, '');

  return {
    name: '@cobalt-ui/plugin-sass',
    config(c): void {
      config = c;
    },
    async build({tokens, metadata}): Promise<BuildResult[]> {
      let output: string[] = [];
      const typographyTokens: ParsedTypographyToken[] = [];

      // metadata (SassDoc)
      output.push('////');
      output.push(`/// ${metadata.name || 'Design Tokens'}`);
      output.push('/// Auto-generated from tokens.json.');
      output.push('/// DO NOT EDIT!');
      output.push('////');
      output.push('');

      // basic tokens
      output.push(...DEPENDENCIES.map((name) => `@use "${name}"${semi}`));
      output.push('');
      output.push(i.indent(`$${VAR_TOKENS}: (`, 0));
      for (const token of tokens) {
        // special case: typography tokens needs @mixins, so bypass normal route
        if (token.$type === 'typography') {
          typographyTokens.push(token);
          output.push(i.indent(`"${token.id}": (`, 1));
          output.push(i.indent(`"${VAR_ERROR}": "This is a typography mixin. Use \`@include typography(\\"${token.id}\\")\` instead.",`, 2));
          output.push(i.indent(`),`, 1));
          continue;
        }

        output.push(i.indent(`"${token.id}": (`, 1));

        // default value
        let value = (typeof options?.transform === 'function' && options.transform(token)) || defaultTransformer(token);
        if (token.$type === 'link' && options?.embedFiles) value = encode(value, config.outDir);
        output.push(i.indent(`default: (${value}),`, 2));

        // modes
        for (const modeName of Object.keys((token.$extensions && token.$extensions.mode) || {})) {
          let modeValue = (typeof options?.transform === 'function' && options.transform(token, modeName)) || defaultTransformer(token, modeName);
          if (token.$type === 'link' && options?.embedFiles) modeValue = encode(modeValue, config.outDir);
          output.push(i.indent(`"${modeName}": (${modeValue}),`, 2));
        }
        output.push(i.indent('),', 1));
      }
      output.push(`)${semi}`);
      output.push('');

      // typography tokens
      output.push(`$${VAR_TYPOGRAPHY}: (`);
      for (const token of typographyTokens) {
        output.push(i.indent(`"${token.id}": (`, 1));
        output.push(i.indent(`default: (`, 2));
        const defaultProperties = Object.entries(token.$value); // legacy: support camelCase properties
        defaultProperties.sort(([a], [b]) => a.localeCompare(b));
        for (const [k, value] of defaultProperties) {
          const property = k.replace(CAMELCASE_RE, '$1-$2').toLowerCase();
          output.push(i.indent(`"${property}": (${Array.isArray(value) ? formatFontNames(value) : value}),`, 3));
        }
        output.push(i.indent(`),`, 2));
        for (const [mode, modeValue] of Object.entries((token.$extensions && token.$extensions.mode) || {})) {
          output.push(i.indent(`"${mode}": (`, 2));
          const modeProperties = Object.entries(modeValue as typeof ParsedTypographyToken['$value']);
          modeProperties.sort(([a], [b]) => a.localeCompare(b));
          for (const [k, value] of modeProperties) {
            const property = k.replace(CAMELCASE_RE, '$1-$2').toLowerCase();
            output.push(i.indent(`"${property}": (${Array.isArray(value) ? formatFontNames(value) : value}),`, 3));
          }
          output.push(i.indent(`),`, 2));
        }
        output.push(i.indent(`),`, 1));
      }
      output.push(`)${semi}`);
      output.push('');

      // utilities
      output.push(TOKEN_FN);
      output.push('');
      output.push(LIST_MODES_FN);
      output.push('');
      output.push(TYPOGRAPHY_MIXIN);
      output.push('');

      return [{filename, contents: output.join('\n')}];
    },
  };
}

/** transform color */
export function transformColor(value: ParsedColorToken['$value']): string {
  return String(value);
}
/** transform dimension */
export function transformDimension(value: ParsedDimensionToken['$value']): string {
  return String(value);
}
/** transform duration */
export function transformDuration(value: ParsedDurationToken['$value']): string {
  return String(value);
}
/** transform font */
export function transformFont(value: ParsedFontToken['$value']): string {
  return formatFontNames(value);
}
/** transform cubic beziér */
export function transformCubicBezier(value: ParsedCubicBezierToken['$value']): string {
  return `cubic-bezier(${value.join(', ')})`;
}
/** transform link */
export function transformLink(value: ParsedLinkToken['$value']): string {
  return `url('${value}')`;
}
/** transform shadow */
export function transformShadow(value: ParsedShadowToken['$value']): string {
  return [value.offsetX, value.offsetY, value.blur, value.spread, value.color].join(' ');
}
/** transform gradient */
export function transformGradient(value: ParsedGradientToken['$value']): string {
  return value.map((g: GradientStop) => `${g.color} ${g.position * 100}%`).join(', ');
}
/** transform transition */
export function transformTransition(value: ParsedTransitionToken['$value']): string {
  const timingFunction = value.timingFunction ? `cubic-bezier(${value.timingFunction.join(',')})` : undefined;
  return [value.duration, value.delay, timingFunction].filter((v) => v !== undefined).join(' ');
}

export function defaultTransformer(token: ParsedToken, mode?: string): string {
  if (mode && (!token.$extensions?.mode || !token.$extensions.mode[mode])) throw new Error(`Token ${token.id} missing "$extensions.mode.${mode}"`);
  switch (token.$type) {
    case 'color':
      return transformColor(mode ? ((token.$extensions as any).mode[mode] as typeof token.$value) : token.$value);
    case 'dimension':
      return transformDimension(mode ? ((token.$extensions as any).mode[mode] as typeof token.$value) : token.$value);
    case 'duration':
      return transformDuration(mode ? ((token.$extensions as any).mode[mode] as typeof token.$value) : token.$value);
    case 'font':
      return transformFont(mode ? ((token.$extensions as any).mode[mode] as typeof token.$value) : token.$value);
    case 'cubicBezier':
      return transformCubicBezier(mode ? ((token.$extensions as any).mode[mode] as typeof token.$value) : token.$value);
    case 'link':
      return transformLink(mode ? ((token.$extensions as any).mode[mode] as typeof token.$value) : token.$value);
    case 'shadow':
      return transformShadow(mode ? ((token.$extensions as any).mode[mode] as typeof token.$value) : token.$value);
    case 'gradient':
      return transformGradient(mode ? ((token.$extensions as any).mode[mode] as typeof token.$value) : token.$value);
    case 'transition':
      return transformTransition(mode ? ((token.$extensions as any).mode[mode] as typeof token.$value) : token.$value);
    default:
      throw new Error(`No transformer defined for $type: ${token.$type} tokens`);
  }
}
