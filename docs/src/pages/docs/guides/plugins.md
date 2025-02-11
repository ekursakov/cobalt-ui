---
title: Plugins
layout: ../../../layouts/docs.astro
---

# Create your own plugins

Creating your own Cobalt plugins is easy if you’re comfortable with JavaScript. This guide is for creating a custom plugin yourself; if you’re looking for instructions on how to use existing plugins, [see the plugins directory](./plugins).

## Why use Cobalt?

Does writing a Cobalt plugin make more sense for your project vs writing a custom script? This is what Cobalt does for you:

1. **Validation.** Cobalt will throw an error on any schema error so no unintended styling breaks through.
2. **Normalization.** `tokens.json`’s flexibility allows polymorphism, and there are several types that can take either `string | string[]`, or `string | object`, etc. Cobalt expands all token values into their maximum values for consistency.
3. **Aliasing.** Aliasing is an essential part of any tokens schema, and it can be tricky when an alias is **an alias of an alias!** Cobalt flattens all aliases automatically and even detects circular references.
4. **Traversal.** `tokens.json` is a deeply-nested object, and those can be tricky to crawl if you’re not used to working with abstract syntax trees (ASTs). Cobalt flattens tokens into an array so that when you write a plugin, you only have to loop over an array once to get every token.
5. **Modes.** Cobalt extends the design tokens format with [modes](/docs/tokens#modes). This includes being able to alias modes with “#”, e.g. `{color.blue#dark}`.
6. **Figma syncing.** Cobalt allows for easy syncing between Figma and your design tokens by providing an API key.

If writing a plugin for Cobalt would save time, read on!

## Basic structure

A Cobalt plugin is a function that returns an object. That object requires only 2 things:

1. **name**: a string that provides the name of your plugin (this will be shown if there are any errors)
2. **build**: an asynchronous function that returns an array of files to be built.

_Note: the following examples will be using TypeScript, but JavaScript will work just as well if you prefer!_

```ts
import type {Plugin} from '@cobalt-ui/core';

export default function myPlugin(): Plugin {
  return {
    name: 'my-plugin',
    async build({tokens}) {
      return [
        {
          filename: 'my-filename.json',
          contents: tokens,
        },
      ];
    },
  };
}
```

`tokens` is that array of tokens that have been validated, normalized, aliased, and all the other actions outlined above.

The return signature of `build` is an array. This means you can output one, or multiple files with your plugin. Since `tokens/` is the default folder where everything gets generated ([configurable](/docs/reference/config/)), in our example we’d be generating a `tokens/my-filename.json` file when our plugin is done. `filename` is how we set the filename (and it accepts subfolders); `contents` is a string of code that will be written to disk (it can also accept a `Buffer` if needed).

For many plugins, an output of one file will suffice (i.e. an array of one). But say you were generating multiple icons from tokens. You’d need to populate the array with one filename & content entry per icon. The array is meant to handle this case, rather than requiring a plugin that generates multiple files to deal with the file system directly and make sure all the user settings were respected.

## Testing

To test your plugin working on your design tokens, add it to your `tokens.config.mjs`:

```js
import myPlugin from './my-plugin.js';

/** @type import('@cobalt-ui/core').Config */
export default {
  plugins: [myPlugin()],
};
```

Now when you run `co build`, your plugin will run and you can see its output.

## Options

Your plugin can accept any options desired as parameters to your main function. What your options are is entirely up to you and what makes sense of your plugin. Here’s an example of letting a user configure the `filename`:

```ts
import type {Plugin} from '@cobalt-ui/core';

export interface MyPluginOptions {
  /** set the output filename */
  filename?: string;
  // add more options here!
}

export default function myPlugin(options: MyPluginOptions = {}): Plugin {
  const filename = options.filename || 'default-filename.json'; // be sure to always set a default!
  return {
    name: 'my-plugin',
    async build({tokens}) {
      return [
        {
          filename,
          contents: tokens,
        },
      ];
    },
  };
}
```

You’d then pass any options into `tokens.config.mjs`:

```js
import myPlugin from './my-plugin.js';

/** @type import('@cobalt-ui/core').Config */
export default {
  plugins: [
    myPlugin({
      filename: 'custom.json',
    }),
  ],
};
```

You can then expand `options` to be whatever shape you need it to be.

## User Config

Plugins may also provide an optional `config()` function to either read the user config, or modify it:

```ts
import type {Plugin} from '@cobalt-ui/core';

export default function myPlugin(): Plugin {
  let outDir: URL | undefined;
  return {
    name: 'my-plugin',
    config(config) {
      outDir = config.outDir; // read the user’s outDir from the config, and save it
      // return nothing to leave config unaltered
    },
    async build({tokens}) {
      console.log(outDir); // now config info is accessible within the build() function

      return [
        {
          filename: 'my-filename.json',
          contents: tokens,
        },
      ];
    },
  };
}
```

`config()` will be fired after the user’s config has been fully loaded and all plugins are instantiated, but before any build happens.

## Cobalt token structure

Cobalt gives you more context when dealing with tokens. Inspecting each individual token will yield the following:

```js
{
  id: 'color.brand.green', // the full ID of the token
  $type: 'color', // the original $type
  $value: '#40c362', // the normalized $value
  $extensions: {
    mode: {…} // normalized modes
  },
  _group: {…} // metadata about the token’s parent group
  _original: {…} // the original node untouched from tokens.json (including unresolved aliases, etc.)
}
```

## Examples

Examples of plugins may be found [in the original source repo](https://github.com/drwpow/cobalt-ui/tree/main/packages).
