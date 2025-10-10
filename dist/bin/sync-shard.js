#!/usr/bin/env -S node --enable-source-maps
import { AsyncResource } from 'async_hooks';
import * as fs4 from 'fs';
import fs4__default from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { request as request$1 } from 'https';
import * as zlib from 'zlib';
import * as crypto from 'crypto';

var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/before-after-hook/lib/register.js
var require_register = __commonJS({
  "node_modules/before-after-hook/lib/register.js"(exports, module) {
    module.exports = register;
    function register(state, name, method, options) {
      if (typeof method !== "function") {
        throw new Error("method for before hook must be a function");
      }
      if (!options) {
        options = {};
      }
      if (Array.isArray(name)) {
        return name.reverse().reduce(function(callback, name2) {
          return register.bind(null, state, name2, callback, options);
        }, method)();
      }
      return Promise.resolve().then(function() {
        if (!state.registry[name]) {
          return method(options);
        }
        return state.registry[name].reduce(function(method2, registered) {
          return registered.hook.bind(null, method2, options);
        }, method)();
      });
    }
  }
});

// node_modules/before-after-hook/lib/add.js
var require_add = __commonJS({
  "node_modules/before-after-hook/lib/add.js"(exports, module) {
    module.exports = addHook;
    function addHook(state, kind, name, hook2) {
      var orig = hook2;
      if (!state.registry[name]) {
        state.registry[name] = [];
      }
      if (kind === "before") {
        hook2 = function(method, options) {
          return Promise.resolve().then(orig.bind(null, options)).then(method.bind(null, options));
        };
      }
      if (kind === "after") {
        hook2 = function(method, options) {
          var result;
          return Promise.resolve().then(method.bind(null, options)).then(function(result_) {
            result = result_;
            return orig(result, options);
          }).then(function() {
            return result;
          });
        };
      }
      if (kind === "error") {
        hook2 = function(method, options) {
          return Promise.resolve().then(method.bind(null, options)).catch(function(error) {
            return orig(error, options);
          });
        };
      }
      state.registry[name].push({
        hook: hook2,
        orig
      });
    }
  }
});

// node_modules/before-after-hook/lib/remove.js
var require_remove = __commonJS({
  "node_modules/before-after-hook/lib/remove.js"(exports, module) {
    module.exports = removeHook;
    function removeHook(state, name, method) {
      if (!state.registry[name]) {
        return;
      }
      var index = state.registry[name].map(function(registered) {
        return registered.orig;
      }).indexOf(method);
      if (index === -1) {
        return;
      }
      state.registry[name].splice(index, 1);
    }
  }
});

// node_modules/before-after-hook/index.js
var require_before_after_hook = __commonJS({
  "node_modules/before-after-hook/index.js"(exports, module) {
    var register = require_register();
    var addHook = require_add();
    var removeHook = require_remove();
    var bind = Function.bind;
    var bindable = bind.bind(bind);
    function bindApi(hook2, state, name) {
      var removeHookRef = bindable(removeHook, null).apply(
        null,
        name ? [state, name] : [state]
      );
      hook2.api = { remove: removeHookRef };
      hook2.remove = removeHookRef;
      ["before", "error", "after", "wrap"].forEach(function(kind) {
        var args = name ? [state, kind, name] : [state, kind];
        hook2[kind] = hook2.api[kind] = bindable(addHook, null).apply(null, args);
      });
    }
    function HookSingular() {
      var singularHookName = "h";
      var singularHookState = {
        registry: {}
      };
      var singularHook = register.bind(null, singularHookState, singularHookName);
      bindApi(singularHook, singularHookState, singularHookName);
      return singularHook;
    }
    function HookCollection() {
      var state = {
        registry: {}
      };
      var hook2 = register.bind(null, state);
      bindApi(hook2, state);
      return hook2;
    }
    var collectionHookDeprecationMessageDisplayed = false;
    function Hook() {
      if (!collectionHookDeprecationMessageDisplayed) {
        console.warn(
          '[before-after-hook]: "Hook()" repurposing warning, use "Hook.Collection()". Read more: https://git.io/upgrade-before-after-hook-to-1.4'
        );
        collectionHookDeprecationMessageDisplayed = true;
      }
      return HookCollection();
    }
    Hook.Singular = HookSingular.bind();
    Hook.Collection = HookCollection.bind();
    module.exports = Hook;
    module.exports.Hook = Hook;
    module.exports.Singular = Hook.Singular;
    module.exports.Collection = Hook.Collection;
  }
});

// node_modules/wrappy/wrappy.js
var require_wrappy = __commonJS({
  "node_modules/wrappy/wrappy.js"(exports, module) {
    module.exports = wrappy;
    function wrappy(fn, cb) {
      if (fn && cb) return wrappy(fn)(cb);
      if (typeof fn !== "function")
        throw new TypeError("need wrapper function");
      Object.keys(fn).forEach(function(k) {
        wrapper[k] = fn[k];
      });
      return wrapper;
      function wrapper() {
        var args = new Array(arguments.length);
        for (var i = 0; i < args.length; i++) {
          args[i] = arguments[i];
        }
        var ret = fn.apply(this, args);
        var cb2 = args[args.length - 1];
        if (typeof ret === "function" && ret !== cb2) {
          Object.keys(cb2).forEach(function(k) {
            ret[k] = cb2[k];
          });
        }
        return ret;
      }
    }
  }
});

// node_modules/once/once.js
var require_once = __commonJS({
  "node_modules/once/once.js"(exports, module) {
    var wrappy = require_wrappy();
    module.exports = wrappy(once2);
    module.exports.strict = wrappy(onceStrict);
    once2.proto = once2(function() {
      Object.defineProperty(Function.prototype, "once", {
        value: function() {
          return once2(this);
        },
        configurable: true
      });
      Object.defineProperty(Function.prototype, "onceStrict", {
        value: function() {
          return onceStrict(this);
        },
        configurable: true
      });
    });
    function once2(fn) {
      var f = function() {
        if (f.called) return f.value;
        f.called = true;
        return f.value = fn.apply(this, arguments);
      };
      f.called = false;
      return f;
    }
    function onceStrict(fn) {
      var f = function() {
        if (f.called)
          throw new Error(f.onceError);
        f.called = true;
        return f.value = fn.apply(this, arguments);
      };
      var name = fn.name || "Function wrapped with `once`";
      f.onceError = name + " shouldn't be called more than once";
      f.called = false;
      return f;
    }
  }
});

// node_modules/dotenv/package.json
var require_package = __commonJS({
  "node_modules/dotenv/package.json"(exports, module) {
    module.exports = {
      name: "dotenv",
      version: "16.6.1",
      description: "Loads environment variables from .env file",
      main: "lib/main.js",
      types: "lib/main.d.ts",
      exports: {
        ".": {
          types: "./lib/main.d.ts",
          require: "./lib/main.js",
          default: "./lib/main.js"
        },
        "./config": "./config.js",
        "./config.js": "./config.js",
        "./lib/env-options": "./lib/env-options.js",
        "./lib/env-options.js": "./lib/env-options.js",
        "./lib/cli-options": "./lib/cli-options.js",
        "./lib/cli-options.js": "./lib/cli-options.js",
        "./package.json": "./package.json"
      },
      scripts: {
        "dts-check": "tsc --project tests/types/tsconfig.json",
        lint: "standard",
        pretest: "npm run lint && npm run dts-check",
        test: "tap run --allow-empty-coverage --disable-coverage --timeout=60000",
        "test:coverage": "tap run --show-full-coverage --timeout=60000 --coverage-report=text --coverage-report=lcov",
        prerelease: "npm test",
        release: "standard-version"
      },
      repository: {
        type: "git",
        url: "git://github.com/motdotla/dotenv.git"
      },
      homepage: "https://github.com/motdotla/dotenv#readme",
      funding: "https://dotenvx.com",
      keywords: [
        "dotenv",
        "env",
        ".env",
        "environment",
        "variables",
        "config",
        "settings"
      ],
      readmeFilename: "README.md",
      license: "BSD-2-Clause",
      devDependencies: {
        "@types/node": "^18.11.3",
        decache: "^4.6.2",
        sinon: "^14.0.1",
        standard: "^17.0.0",
        "standard-version": "^9.5.0",
        tap: "^19.2.0",
        typescript: "^4.8.4"
      },
      engines: {
        node: ">=12"
      },
      browser: {
        fs: false
      }
    };
  }
});

// node_modules/dotenv/lib/main.js
var require_main = __commonJS({
  "node_modules/dotenv/lib/main.js"(exports, module) {
    var fs5 = __require("fs");
    var path2 = __require("path");
    var os = __require("os");
    var crypto3 = __require("crypto");
    var packageJson = require_package();
    var version = packageJson.version;
    var LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg;
    function parse2(src) {
      const obj = {};
      let lines = src.toString();
      lines = lines.replace(/\r\n?/mg, "\n");
      let match;
      while ((match = LINE.exec(lines)) != null) {
        const key = match[1];
        let value = match[2] || "";
        value = value.trim();
        const maybeQuote = value[0];
        value = value.replace(/^(['"`])([\s\S]*)\1$/mg, "$2");
        if (maybeQuote === '"') {
          value = value.replace(/\\n/g, "\n");
          value = value.replace(/\\r/g, "\r");
        }
        obj[key] = value;
      }
      return obj;
    }
    function _parseVault(options) {
      options = options || {};
      const vaultPath = _vaultPath(options);
      options.path = vaultPath;
      const result = DotenvModule.configDotenv(options);
      if (!result.parsed) {
        const err = new Error(`MISSING_DATA: Cannot parse ${vaultPath} for an unknown reason`);
        err.code = "MISSING_DATA";
        throw err;
      }
      const keys = _dotenvKey(options).split(",");
      const length = keys.length;
      let decrypted;
      for (let i = 0; i < length; i++) {
        try {
          const key = keys[i].trim();
          const attrs = _instructions(result, key);
          decrypted = DotenvModule.decrypt(attrs.ciphertext, attrs.key);
          break;
        } catch (error) {
          if (i + 1 >= length) {
            throw error;
          }
        }
      }
      return DotenvModule.parse(decrypted);
    }
    function _warn(message) {
      console.log(`[dotenv@${version}][WARN] ${message}`);
    }
    function _debug(message) {
      console.log(`[dotenv@${version}][DEBUG] ${message}`);
    }
    function _log(message) {
      console.log(`[dotenv@${version}] ${message}`);
    }
    function _dotenvKey(options) {
      if (options && options.DOTENV_KEY && options.DOTENV_KEY.length > 0) {
        return options.DOTENV_KEY;
      }
      if (process.env.DOTENV_KEY && process.env.DOTENV_KEY.length > 0) {
        return process.env.DOTENV_KEY;
      }
      return "";
    }
    function _instructions(result, dotenvKey) {
      let uri;
      try {
        uri = new URL(dotenvKey);
      } catch (error) {
        if (error.code === "ERR_INVALID_URL") {
          const err = new Error("INVALID_DOTENV_KEY: Wrong format. Must be in valid uri format like dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=development");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        }
        throw error;
      }
      const key = uri.password;
      if (!key) {
        const err = new Error("INVALID_DOTENV_KEY: Missing key part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environment = uri.searchParams.get("environment");
      if (!environment) {
        const err = new Error("INVALID_DOTENV_KEY: Missing environment part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environmentKey = `DOTENV_VAULT_${environment.toUpperCase()}`;
      const ciphertext = result.parsed[environmentKey];
      if (!ciphertext) {
        const err = new Error(`NOT_FOUND_DOTENV_ENVIRONMENT: Cannot locate environment ${environmentKey} in your .env.vault file.`);
        err.code = "NOT_FOUND_DOTENV_ENVIRONMENT";
        throw err;
      }
      return { ciphertext, key };
    }
    function _vaultPath(options) {
      let possibleVaultPath = null;
      if (options && options.path && options.path.length > 0) {
        if (Array.isArray(options.path)) {
          for (const filepath of options.path) {
            if (fs5.existsSync(filepath)) {
              possibleVaultPath = filepath.endsWith(".vault") ? filepath : `${filepath}.vault`;
            }
          }
        } else {
          possibleVaultPath = options.path.endsWith(".vault") ? options.path : `${options.path}.vault`;
        }
      } else {
        possibleVaultPath = path2.resolve(process.cwd(), ".env.vault");
      }
      if (fs5.existsSync(possibleVaultPath)) {
        return possibleVaultPath;
      }
      return null;
    }
    function _resolveHome(envPath) {
      return envPath[0] === "~" ? path2.join(os.homedir(), envPath.slice(1)) : envPath;
    }
    function _configVault(options) {
      const debug = Boolean(options && options.debug);
      const quiet = options && "quiet" in options ? options.quiet : true;
      if (debug || !quiet) {
        _log("Loading env from encrypted .env.vault");
      }
      const parsed = DotenvModule._parseVault(options);
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      DotenvModule.populate(processEnv, parsed, options);
      return { parsed };
    }
    function configDotenv(options) {
      const dotenvPath = path2.resolve(process.cwd(), ".env");
      let encoding = "utf8";
      const debug = Boolean(options && options.debug);
      const quiet = options && "quiet" in options ? options.quiet : true;
      if (options && options.encoding) {
        encoding = options.encoding;
      } else {
        if (debug) {
          _debug("No encoding is specified. UTF-8 is used by default");
        }
      }
      let optionPaths = [dotenvPath];
      if (options && options.path) {
        if (!Array.isArray(options.path)) {
          optionPaths = [_resolveHome(options.path)];
        } else {
          optionPaths = [];
          for (const filepath of options.path) {
            optionPaths.push(_resolveHome(filepath));
          }
        }
      }
      let lastError;
      const parsedAll = {};
      for (const path3 of optionPaths) {
        try {
          const parsed = DotenvModule.parse(fs5.readFileSync(path3, { encoding }));
          DotenvModule.populate(parsedAll, parsed, options);
        } catch (e) {
          if (debug) {
            _debug(`Failed to load ${path3} ${e.message}`);
          }
          lastError = e;
        }
      }
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      DotenvModule.populate(processEnv, parsedAll, options);
      if (debug || !quiet) {
        const keysCount = Object.keys(parsedAll).length;
        const shortPaths = [];
        for (const filePath of optionPaths) {
          try {
            const relative = path2.relative(process.cwd(), filePath);
            shortPaths.push(relative);
          } catch (e) {
            if (debug) {
              _debug(`Failed to load ${filePath} ${e.message}`);
            }
            lastError = e;
          }
        }
        _log(`injecting env (${keysCount}) from ${shortPaths.join(",")}`);
      }
      if (lastError) {
        return { parsed: parsedAll, error: lastError };
      } else {
        return { parsed: parsedAll };
      }
    }
    function config(options) {
      if (_dotenvKey(options).length === 0) {
        return DotenvModule.configDotenv(options);
      }
      const vaultPath = _vaultPath(options);
      if (!vaultPath) {
        _warn(`You set DOTENV_KEY but you are missing a .env.vault file at ${vaultPath}. Did you forget to build it?`);
        return DotenvModule.configDotenv(options);
      }
      return DotenvModule._configVault(options);
    }
    function decrypt(encrypted, keyStr) {
      const key = Buffer.from(keyStr.slice(-64), "hex");
      let ciphertext = Buffer.from(encrypted, "base64");
      const nonce = ciphertext.subarray(0, 12);
      const authTag = ciphertext.subarray(-16);
      ciphertext = ciphertext.subarray(12, -16);
      try {
        const aesgcm = crypto3.createDecipheriv("aes-256-gcm", key, nonce);
        aesgcm.setAuthTag(authTag);
        return `${aesgcm.update(ciphertext)}${aesgcm.final()}`;
      } catch (error) {
        const isRange = error instanceof RangeError;
        const invalidKeyLength = error.message === "Invalid key length";
        const decryptionFailed = error.message === "Unsupported state or unable to authenticate data";
        if (isRange || invalidKeyLength) {
          const err = new Error("INVALID_DOTENV_KEY: It must be 64 characters long (or more)");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        } else if (decryptionFailed) {
          const err = new Error("DECRYPTION_FAILED: Please check your DOTENV_KEY");
          err.code = "DECRYPTION_FAILED";
          throw err;
        } else {
          throw error;
        }
      }
    }
    function populate(processEnv, parsed, options = {}) {
      const debug = Boolean(options && options.debug);
      const override = Boolean(options && options.override);
      if (typeof parsed !== "object") {
        const err = new Error("OBJECT_REQUIRED: Please check the processEnv argument being passed to populate");
        err.code = "OBJECT_REQUIRED";
        throw err;
      }
      for (const key of Object.keys(parsed)) {
        if (Object.prototype.hasOwnProperty.call(processEnv, key)) {
          if (override === true) {
            processEnv[key] = parsed[key];
          }
          if (debug) {
            if (override === true) {
              _debug(`"${key}" is already defined and WAS overwritten`);
            } else {
              _debug(`"${key}" is already defined and was NOT overwritten`);
            }
          }
        } else {
          processEnv[key] = parsed[key];
        }
      }
    }
    var DotenvModule = {
      configDotenv,
      _configVault,
      _parseVault,
      config,
      decrypt,
      parse: parse2,
      populate
    };
    module.exports.configDotenv = DotenvModule.configDotenv;
    module.exports._configVault = DotenvModule._configVault;
    module.exports._parseVault = DotenvModule._parseVault;
    module.exports.config = DotenvModule.config;
    module.exports.decrypt = DotenvModule.decrypt;
    module.exports.parse = DotenvModule.parse;
    module.exports.populate = DotenvModule.populate;
    module.exports = DotenvModule;
  }
});

// node_modules/universal-user-agent/dist-web/index.js
function getUserAgent() {
  if (typeof navigator === "object" && "userAgent" in navigator) {
    return navigator.userAgent;
  }
  if (typeof process === "object" && process.version !== void 0) {
    return `Node.js/${process.version.substr(1)} (${process.platform}; ${process.arch})`;
  }
  return "<environment undetectable>";
}

// node_modules/@octokit/core/dist-web/index.js
var import_before_after_hook = __toESM(require_before_after_hook());

// node_modules/@octokit/endpoint/dist-src/version.js
var VERSION = "9.0.6";

// node_modules/@octokit/endpoint/dist-src/defaults.js
var userAgent = `octokit-endpoint.js/${VERSION} ${getUserAgent()}`;
var DEFAULTS = {
  method: "GET",
  baseUrl: "https://api.github.com",
  headers: {
    accept: "application/vnd.github.v3+json",
    "user-agent": userAgent
  },
  mediaType: {
    format: ""
  }
};

// node_modules/@octokit/endpoint/dist-src/util/lowercase-keys.js
function lowercaseKeys(object) {
  if (!object) {
    return {};
  }
  return Object.keys(object).reduce((newObj, key) => {
    newObj[key.toLowerCase()] = object[key];
    return newObj;
  }, {});
}

// node_modules/@octokit/endpoint/dist-src/util/is-plain-object.js
function isPlainObject(value) {
  if (typeof value !== "object" || value === null)
    return false;
  if (Object.prototype.toString.call(value) !== "[object Object]")
    return false;
  const proto = Object.getPrototypeOf(value);
  if (proto === null)
    return true;
  const Ctor = Object.prototype.hasOwnProperty.call(proto, "constructor") && proto.constructor;
  return typeof Ctor === "function" && Ctor instanceof Ctor && Function.prototype.call(Ctor) === Function.prototype.call(value);
}

// node_modules/@octokit/endpoint/dist-src/util/merge-deep.js
function mergeDeep(defaults, options) {
  const result = Object.assign({}, defaults);
  Object.keys(options).forEach((key) => {
    if (isPlainObject(options[key])) {
      if (!(key in defaults))
        Object.assign(result, { [key]: options[key] });
      else
        result[key] = mergeDeep(defaults[key], options[key]);
    } else {
      Object.assign(result, { [key]: options[key] });
    }
  });
  return result;
}

// node_modules/@octokit/endpoint/dist-src/util/remove-undefined-properties.js
function removeUndefinedProperties(obj) {
  for (const key in obj) {
    if (obj[key] === void 0) {
      delete obj[key];
    }
  }
  return obj;
}

// node_modules/@octokit/endpoint/dist-src/merge.js
function merge(defaults, route, options) {
  if (typeof route === "string") {
    let [method, url] = route.split(" ");
    options = Object.assign(url ? { method, url } : { url: method }, options);
  } else {
    options = Object.assign({}, route);
  }
  options.headers = lowercaseKeys(options.headers);
  removeUndefinedProperties(options);
  removeUndefinedProperties(options.headers);
  const mergedOptions = mergeDeep(defaults || {}, options);
  if (options.url === "/graphql") {
    if (defaults && defaults.mediaType.previews?.length) {
      mergedOptions.mediaType.previews = defaults.mediaType.previews.filter(
        (preview) => !mergedOptions.mediaType.previews.includes(preview)
      ).concat(mergedOptions.mediaType.previews);
    }
    mergedOptions.mediaType.previews = (mergedOptions.mediaType.previews || []).map((preview) => preview.replace(/-preview/, ""));
  }
  return mergedOptions;
}

// node_modules/@octokit/endpoint/dist-src/util/add-query-parameters.js
function addQueryParameters(url, parameters) {
  const separator = /\?/.test(url) ? "&" : "?";
  const names = Object.keys(parameters);
  if (names.length === 0) {
    return url;
  }
  return url + separator + names.map((name) => {
    if (name === "q") {
      return "q=" + parameters.q.split("+").map(encodeURIComponent).join("+");
    }
    return `${name}=${encodeURIComponent(parameters[name])}`;
  }).join("&");
}

// node_modules/@octokit/endpoint/dist-src/util/extract-url-variable-names.js
var urlVariableRegex = /\{[^{}}]+\}/g;
function removeNonChars(variableName) {
  return variableName.replace(/(?:^\W+)|(?:(?<!\W)\W+$)/g, "").split(/,/);
}
function extractUrlVariableNames(url) {
  const matches = url.match(urlVariableRegex);
  if (!matches) {
    return [];
  }
  return matches.map(removeNonChars).reduce((a, b) => a.concat(b), []);
}

// node_modules/@octokit/endpoint/dist-src/util/omit.js
function omit(object, keysToOmit) {
  const result = { __proto__: null };
  for (const key of Object.keys(object)) {
    if (keysToOmit.indexOf(key) === -1) {
      result[key] = object[key];
    }
  }
  return result;
}

// node_modules/@octokit/endpoint/dist-src/util/url-template.js
function encodeReserved(str) {
  return str.split(/(%[0-9A-Fa-f]{2})/g).map(function(part) {
    if (!/%[0-9A-Fa-f]/.test(part)) {
      part = encodeURI(part).replace(/%5B/g, "[").replace(/%5D/g, "]");
    }
    return part;
  }).join("");
}
function encodeUnreserved(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, function(c) {
    return "%" + c.charCodeAt(0).toString(16).toUpperCase();
  });
}
function encodeValue(operator, value, key) {
  value = operator === "+" || operator === "#" ? encodeReserved(value) : encodeUnreserved(value);
  if (key) {
    return encodeUnreserved(key) + "=" + value;
  } else {
    return value;
  }
}
function isDefined(value) {
  return value !== void 0 && value !== null;
}
function isKeyOperator(operator) {
  return operator === ";" || operator === "&" || operator === "?";
}
function getValues(context, operator, key, modifier) {
  var value = context[key], result = [];
  if (isDefined(value) && value !== "") {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      value = value.toString();
      if (modifier && modifier !== "*") {
        value = value.substring(0, parseInt(modifier, 10));
      }
      result.push(
        encodeValue(operator, value, isKeyOperator(operator) ? key : "")
      );
    } else {
      if (modifier === "*") {
        if (Array.isArray(value)) {
          value.filter(isDefined).forEach(function(value2) {
            result.push(
              encodeValue(operator, value2, isKeyOperator(operator) ? key : "")
            );
          });
        } else {
          Object.keys(value).forEach(function(k) {
            if (isDefined(value[k])) {
              result.push(encodeValue(operator, value[k], k));
            }
          });
        }
      } else {
        const tmp = [];
        if (Array.isArray(value)) {
          value.filter(isDefined).forEach(function(value2) {
            tmp.push(encodeValue(operator, value2));
          });
        } else {
          Object.keys(value).forEach(function(k) {
            if (isDefined(value[k])) {
              tmp.push(encodeUnreserved(k));
              tmp.push(encodeValue(operator, value[k].toString()));
            }
          });
        }
        if (isKeyOperator(operator)) {
          result.push(encodeUnreserved(key) + "=" + tmp.join(","));
        } else if (tmp.length !== 0) {
          result.push(tmp.join(","));
        }
      }
    }
  } else {
    if (operator === ";") {
      if (isDefined(value)) {
        result.push(encodeUnreserved(key));
      }
    } else if (value === "" && (operator === "&" || operator === "?")) {
      result.push(encodeUnreserved(key) + "=");
    } else if (value === "") {
      result.push("");
    }
  }
  return result;
}
function parseUrl(template) {
  return {
    expand: expand.bind(null, template)
  };
}
function expand(template, context) {
  var operators = ["+", "#", ".", "/", ";", "?", "&"];
  template = template.replace(
    /\{([^\{\}]+)\}|([^\{\}]+)/g,
    function(_, expression, literal) {
      if (expression) {
        let operator = "";
        const values = [];
        if (operators.indexOf(expression.charAt(0)) !== -1) {
          operator = expression.charAt(0);
          expression = expression.substr(1);
        }
        expression.split(/,/g).forEach(function(variable) {
          var tmp = /([^:\*]*)(?::(\d+)|(\*))?/.exec(variable);
          values.push(getValues(context, operator, tmp[1], tmp[2] || tmp[3]));
        });
        if (operator && operator !== "+") {
          var separator = ",";
          if (operator === "?") {
            separator = "&";
          } else if (operator !== "#") {
            separator = operator;
          }
          return (values.length !== 0 ? operator : "") + values.join(separator);
        } else {
          return values.join(",");
        }
      } else {
        return encodeReserved(literal);
      }
    }
  );
  if (template === "/") {
    return template;
  } else {
    return template.replace(/\/$/, "");
  }
}

// node_modules/@octokit/endpoint/dist-src/parse.js
function parse(options) {
  let method = options.method.toUpperCase();
  let url = (options.url || "/").replace(/:([a-z]\w+)/g, "{$1}");
  let headers = Object.assign({}, options.headers);
  let body;
  let parameters = omit(options, [
    "method",
    "baseUrl",
    "url",
    "headers",
    "request",
    "mediaType"
  ]);
  const urlVariableNames = extractUrlVariableNames(url);
  url = parseUrl(url).expand(parameters);
  if (!/^http/.test(url)) {
    url = options.baseUrl + url;
  }
  const omittedParameters = Object.keys(options).filter((option) => urlVariableNames.includes(option)).concat("baseUrl");
  const remainingParameters = omit(parameters, omittedParameters);
  const isBinaryRequest = /application\/octet-stream/i.test(headers.accept);
  if (!isBinaryRequest) {
    if (options.mediaType.format) {
      headers.accept = headers.accept.split(/,/).map(
        (format) => format.replace(
          /application\/vnd(\.\w+)(\.v3)?(\.\w+)?(\+json)?$/,
          `application/vnd$1$2.${options.mediaType.format}`
        )
      ).join(",");
    }
    if (url.endsWith("/graphql")) {
      if (options.mediaType.previews?.length) {
        const previewsFromAcceptHeader = headers.accept.match(/(?<![\w-])[\w-]+(?=-preview)/g) || [];
        headers.accept = previewsFromAcceptHeader.concat(options.mediaType.previews).map((preview) => {
          const format = options.mediaType.format ? `.${options.mediaType.format}` : "+json";
          return `application/vnd.github.${preview}-preview${format}`;
        }).join(",");
      }
    }
  }
  if (["GET", "HEAD"].includes(method)) {
    url = addQueryParameters(url, remainingParameters);
  } else {
    if ("data" in remainingParameters) {
      body = remainingParameters.data;
    } else {
      if (Object.keys(remainingParameters).length) {
        body = remainingParameters;
      }
    }
  }
  if (!headers["content-type"] && typeof body !== "undefined") {
    headers["content-type"] = "application/json; charset=utf-8";
  }
  if (["PATCH", "PUT"].includes(method) && typeof body === "undefined") {
    body = "";
  }
  return Object.assign(
    { method, url, headers },
    typeof body !== "undefined" ? { body } : null,
    options.request ? { request: options.request } : null
  );
}

// node_modules/@octokit/endpoint/dist-src/endpoint-with-defaults.js
function endpointWithDefaults(defaults, route, options) {
  return parse(merge(defaults, route, options));
}

// node_modules/@octokit/endpoint/dist-src/with-defaults.js
function withDefaults(oldDefaults, newDefaults) {
  const DEFAULTS2 = merge(oldDefaults, newDefaults);
  const endpoint2 = endpointWithDefaults.bind(null, DEFAULTS2);
  return Object.assign(endpoint2, {
    DEFAULTS: DEFAULTS2,
    defaults: withDefaults.bind(null, DEFAULTS2),
    merge: merge.bind(null, DEFAULTS2),
    parse
  });
}

// node_modules/@octokit/endpoint/dist-src/index.js
var endpoint = withDefaults(null, DEFAULTS);

// node_modules/@octokit/request/dist-src/version.js
var VERSION2 = "8.4.1";

// node_modules/@octokit/request/dist-src/is-plain-object.js
function isPlainObject2(value) {
  if (typeof value !== "object" || value === null)
    return false;
  if (Object.prototype.toString.call(value) !== "[object Object]")
    return false;
  const proto = Object.getPrototypeOf(value);
  if (proto === null)
    return true;
  const Ctor = Object.prototype.hasOwnProperty.call(proto, "constructor") && proto.constructor;
  return typeof Ctor === "function" && Ctor instanceof Ctor && Function.prototype.call(Ctor) === Function.prototype.call(value);
}

// node_modules/deprecation/dist-web/index.js
var Deprecation = class extends Error {
  constructor(message) {
    super(message);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
    this.name = "Deprecation";
  }
};

// node_modules/@octokit/request-error/dist-src/index.js
var import_once = __toESM(require_once());
var logOnceCode = (0, import_once.default)((deprecation) => console.warn(deprecation));
var logOnceHeaders = (0, import_once.default)((deprecation) => console.warn(deprecation));
var RequestError = class extends Error {
  constructor(message, statusCode, options) {
    super(message);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
    this.name = "HttpError";
    this.status = statusCode;
    let headers;
    if ("headers" in options && typeof options.headers !== "undefined") {
      headers = options.headers;
    }
    if ("response" in options) {
      this.response = options.response;
      headers = options.response.headers;
    }
    const requestCopy = Object.assign({}, options.request);
    if (options.request.headers.authorization) {
      requestCopy.headers = Object.assign({}, options.request.headers, {
        authorization: options.request.headers.authorization.replace(
          /(?<! ) .*$/,
          " [REDACTED]"
        )
      });
    }
    requestCopy.url = requestCopy.url.replace(/\bclient_secret=\w+/g, "client_secret=[REDACTED]").replace(/\baccess_token=\w+/g, "access_token=[REDACTED]");
    this.request = requestCopy;
    Object.defineProperty(this, "code", {
      get() {
        logOnceCode(
          new Deprecation(
            "[@octokit/request-error] `error.code` is deprecated, use `error.status`."
          )
        );
        return statusCode;
      }
    });
    Object.defineProperty(this, "headers", {
      get() {
        logOnceHeaders(
          new Deprecation(
            "[@octokit/request-error] `error.headers` is deprecated, use `error.response.headers`."
          )
        );
        return headers || {};
      }
    });
  }
};

// node_modules/@octokit/request/dist-src/get-buffer-response.js
function getBufferResponse(response) {
  return response.arrayBuffer();
}

// node_modules/@octokit/request/dist-src/fetch-wrapper.js
function fetchWrapper(requestOptions) {
  const log = requestOptions.request && requestOptions.request.log ? requestOptions.request.log : console;
  const parseSuccessResponseBody = requestOptions.request?.parseSuccessResponseBody !== false;
  if (isPlainObject2(requestOptions.body) || Array.isArray(requestOptions.body)) {
    requestOptions.body = JSON.stringify(requestOptions.body);
  }
  let headers = {};
  let status;
  let url;
  let { fetch } = globalThis;
  if (requestOptions.request?.fetch) {
    fetch = requestOptions.request.fetch;
  }
  if (!fetch) {
    throw new Error(
      "fetch is not set. Please pass a fetch implementation as new Octokit({ request: { fetch }}). Learn more at https://github.com/octokit/octokit.js/#fetch-missing"
    );
  }
  return fetch(requestOptions.url, {
    method: requestOptions.method,
    body: requestOptions.body,
    redirect: requestOptions.request?.redirect,
    headers: requestOptions.headers,
    signal: requestOptions.request?.signal,
    // duplex must be set if request.body is ReadableStream or Async Iterables.
    // See https://fetch.spec.whatwg.org/#dom-requestinit-duplex.
    ...requestOptions.body && { duplex: "half" }
  }).then(async (response) => {
    url = response.url;
    status = response.status;
    for (const keyAndValue of response.headers) {
      headers[keyAndValue[0]] = keyAndValue[1];
    }
    if ("deprecation" in headers) {
      const matches = headers.link && headers.link.match(/<([^<>]+)>; rel="deprecation"/);
      const deprecationLink = matches && matches.pop();
      log.warn(
        `[@octokit/request] "${requestOptions.method} ${requestOptions.url}" is deprecated. It is scheduled to be removed on ${headers.sunset}${deprecationLink ? `. See ${deprecationLink}` : ""}`
      );
    }
    if (status === 204 || status === 205) {
      return;
    }
    if (requestOptions.method === "HEAD") {
      if (status < 400) {
        return;
      }
      throw new RequestError(response.statusText, status, {
        response: {
          url,
          status,
          headers,
          data: void 0
        },
        request: requestOptions
      });
    }
    if (status === 304) {
      throw new RequestError("Not modified", status, {
        response: {
          url,
          status,
          headers,
          data: await getResponseData(response)
        },
        request: requestOptions
      });
    }
    if (status >= 400) {
      const data = await getResponseData(response);
      const error = new RequestError(toErrorMessage(data), status, {
        response: {
          url,
          status,
          headers,
          data
        },
        request: requestOptions
      });
      throw error;
    }
    return parseSuccessResponseBody ? await getResponseData(response) : response.body;
  }).then((data) => {
    return {
      status,
      url,
      headers,
      data
    };
  }).catch((error) => {
    if (error instanceof RequestError)
      throw error;
    else if (error.name === "AbortError")
      throw error;
    let message = error.message;
    if (error.name === "TypeError" && "cause" in error) {
      if (error.cause instanceof Error) {
        message = error.cause.message;
      } else if (typeof error.cause === "string") {
        message = error.cause;
      }
    }
    throw new RequestError(message, 500, {
      request: requestOptions
    });
  });
}
async function getResponseData(response) {
  const contentType = response.headers.get("content-type");
  if (/application\/json/.test(contentType)) {
    return response.json().catch(() => response.text()).catch(() => "");
  }
  if (!contentType || /^text\/|charset=utf-8$/.test(contentType)) {
    return response.text();
  }
  return getBufferResponse(response);
}
function toErrorMessage(data) {
  if (typeof data === "string")
    return data;
  let suffix;
  if ("documentation_url" in data) {
    suffix = ` - ${data.documentation_url}`;
  } else {
    suffix = "";
  }
  if ("message" in data) {
    if (Array.isArray(data.errors)) {
      return `${data.message}: ${data.errors.map(JSON.stringify).join(", ")}${suffix}`;
    }
    return `${data.message}${suffix}`;
  }
  return `Unknown error: ${JSON.stringify(data)}`;
}

// node_modules/@octokit/request/dist-src/with-defaults.js
function withDefaults2(oldEndpoint, newDefaults) {
  const endpoint2 = oldEndpoint.defaults(newDefaults);
  const newApi = function(route, parameters) {
    const endpointOptions = endpoint2.merge(route, parameters);
    if (!endpointOptions.request || !endpointOptions.request.hook) {
      return fetchWrapper(endpoint2.parse(endpointOptions));
    }
    const request3 = (route2, parameters2) => {
      return fetchWrapper(
        endpoint2.parse(endpoint2.merge(route2, parameters2))
      );
    };
    Object.assign(request3, {
      endpoint: endpoint2,
      defaults: withDefaults2.bind(null, endpoint2)
    });
    return endpointOptions.request.hook(request3, endpointOptions);
  };
  return Object.assign(newApi, {
    endpoint: endpoint2,
    defaults: withDefaults2.bind(null, endpoint2)
  });
}

// node_modules/@octokit/request/dist-src/index.js
var request = withDefaults2(endpoint, {
  headers: {
    "user-agent": `octokit-request.js/${VERSION2} ${getUserAgent()}`
  }
});

// node_modules/@octokit/graphql/dist-web/index.js
var VERSION3 = "7.1.1";
function _buildMessageForResponseErrors(data) {
  return `Request failed due to following response errors:
` + data.errors.map((e) => ` - ${e.message}`).join("\n");
}
var GraphqlResponseError = class extends Error {
  constructor(request22, headers, response) {
    super(_buildMessageForResponseErrors(response));
    this.request = request22;
    this.headers = headers;
    this.response = response;
    this.name = "GraphqlResponseError";
    this.errors = response.errors;
    this.data = response.data;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
};
var NON_VARIABLE_OPTIONS = [
  "method",
  "baseUrl",
  "url",
  "headers",
  "request",
  "query",
  "mediaType"
];
var FORBIDDEN_VARIABLE_OPTIONS = ["query", "method", "url"];
var GHES_V3_SUFFIX_REGEX = /\/api\/v3\/?$/;
function graphql(request22, query, options) {
  if (options) {
    if (typeof query === "string" && "query" in options) {
      return Promise.reject(
        new Error(`[@octokit/graphql] "query" cannot be used as variable name`)
      );
    }
    for (const key in options) {
      if (!FORBIDDEN_VARIABLE_OPTIONS.includes(key)) continue;
      return Promise.reject(
        new Error(
          `[@octokit/graphql] "${key}" cannot be used as variable name`
        )
      );
    }
  }
  const parsedOptions = typeof query === "string" ? Object.assign({ query }, options) : query;
  const requestOptions = Object.keys(
    parsedOptions
  ).reduce((result, key) => {
    if (NON_VARIABLE_OPTIONS.includes(key)) {
      result[key] = parsedOptions[key];
      return result;
    }
    if (!result.variables) {
      result.variables = {};
    }
    result.variables[key] = parsedOptions[key];
    return result;
  }, {});
  const baseUrl = parsedOptions.baseUrl || request22.endpoint.DEFAULTS.baseUrl;
  if (GHES_V3_SUFFIX_REGEX.test(baseUrl)) {
    requestOptions.url = baseUrl.replace(GHES_V3_SUFFIX_REGEX, "/api/graphql");
  }
  return request22(requestOptions).then((response) => {
    if (response.data.errors) {
      const headers = {};
      for (const key of Object.keys(response.headers)) {
        headers[key] = response.headers[key];
      }
      throw new GraphqlResponseError(
        requestOptions,
        headers,
        response.data
      );
    }
    return response.data.data;
  });
}
function withDefaults3(request22, newDefaults) {
  const newRequest = request22.defaults(newDefaults);
  const newApi = (query, options) => {
    return graphql(newRequest, query, options);
  };
  return Object.assign(newApi, {
    defaults: withDefaults3.bind(null, newRequest),
    endpoint: newRequest.endpoint
  });
}
withDefaults3(request, {
  headers: {
    "user-agent": `octokit-graphql.js/${VERSION3} ${getUserAgent()}`
  },
  method: "POST",
  url: "/graphql"
});
function withCustomRequest(customRequest) {
  return withDefaults3(customRequest, {
    method: "POST",
    url: "/graphql"
  });
}

// node_modules/@octokit/auth-token/dist-src/auth.js
var REGEX_IS_INSTALLATION_LEGACY = /^v1\./;
var REGEX_IS_INSTALLATION = /^ghs_/;
var REGEX_IS_USER_TO_SERVER = /^ghu_/;
async function auth(token) {
  const isApp = token.split(/\./).length === 3;
  const isInstallation = REGEX_IS_INSTALLATION_LEGACY.test(token) || REGEX_IS_INSTALLATION.test(token);
  const isUserToServer = REGEX_IS_USER_TO_SERVER.test(token);
  const tokenType = isApp ? "app" : isInstallation ? "installation" : isUserToServer ? "user-to-server" : "oauth";
  return {
    type: "token",
    token,
    tokenType
  };
}

// node_modules/@octokit/auth-token/dist-src/with-authorization-prefix.js
function withAuthorizationPrefix(token) {
  if (token.split(/\./).length === 3) {
    return `bearer ${token}`;
  }
  return `token ${token}`;
}

// node_modules/@octokit/auth-token/dist-src/hook.js
async function hook(token, request3, route, parameters) {
  const endpoint2 = request3.endpoint.merge(
    route,
    parameters
  );
  endpoint2.headers.authorization = withAuthorizationPrefix(token);
  return request3(endpoint2);
}

// node_modules/@octokit/auth-token/dist-src/index.js
var createTokenAuth = function createTokenAuth2(token) {
  if (!token) {
    throw new Error("[@octokit/auth-token] No token passed to createTokenAuth");
  }
  if (typeof token !== "string") {
    throw new Error(
      "[@octokit/auth-token] Token passed to createTokenAuth is not a string"
    );
  }
  token = token.replace(/^(token|bearer) +/i, "");
  return Object.assign(auth.bind(null, token), {
    hook: hook.bind(null, token)
  });
};

// node_modules/@octokit/core/dist-web/index.js
var VERSION4 = "5.2.2";
var noop = () => {
};
var consoleWarn = console.warn.bind(console);
var consoleError = console.error.bind(console);
function createLogger(logger = {}) {
  if (typeof logger.debug !== "function") {
    logger.debug = noop;
  }
  if (typeof logger.info !== "function") {
    logger.info = noop;
  }
  if (typeof logger.warn !== "function") {
    logger.warn = consoleWarn;
  }
  if (typeof logger.error !== "function") {
    logger.error = consoleError;
  }
  return logger;
}
var userAgentTrail = `octokit-core.js/${VERSION4} ${getUserAgent()}`;
var Octokit = class {
  static {
    this.VERSION = VERSION4;
  }
  static defaults(defaults) {
    const OctokitWithDefaults = class extends this {
      constructor(...args) {
        const options = args[0] || {};
        if (typeof defaults === "function") {
          super(defaults(options));
          return;
        }
        super(
          Object.assign(
            {},
            defaults,
            options,
            options.userAgent && defaults.userAgent ? {
              userAgent: `${options.userAgent} ${defaults.userAgent}`
            } : null
          )
        );
      }
    };
    return OctokitWithDefaults;
  }
  static {
    this.plugins = [];
  }
  /**
   * Attach a plugin (or many) to your Octokit instance.
   *
   * @example
   * const API = Octokit.plugin(plugin1, plugin2, plugin3, ...)
   */
  static plugin(...newPlugins) {
    const currentPlugins = this.plugins;
    const NewOctokit = class extends this {
      static {
        this.plugins = currentPlugins.concat(
          newPlugins.filter((plugin) => !currentPlugins.includes(plugin))
        );
      }
    };
    return NewOctokit;
  }
  constructor(options = {}) {
    const hook2 = new import_before_after_hook.Collection();
    const requestDefaults = {
      baseUrl: request.endpoint.DEFAULTS.baseUrl,
      headers: {},
      request: Object.assign({}, options.request, {
        // @ts-ignore internal usage only, no need to type
        hook: hook2.bind(null, "request")
      }),
      mediaType: {
        previews: [],
        format: ""
      }
    };
    requestDefaults.headers["user-agent"] = options.userAgent ? `${options.userAgent} ${userAgentTrail}` : userAgentTrail;
    if (options.baseUrl) {
      requestDefaults.baseUrl = options.baseUrl;
    }
    if (options.previews) {
      requestDefaults.mediaType.previews = options.previews;
    }
    if (options.timeZone) {
      requestDefaults.headers["time-zone"] = options.timeZone;
    }
    this.request = request.defaults(requestDefaults);
    this.graphql = withCustomRequest(this.request).defaults(requestDefaults);
    this.log = createLogger(options.log);
    this.hook = hook2;
    if (!options.authStrategy) {
      if (!options.auth) {
        this.auth = async () => ({
          type: "unauthenticated"
        });
      } else {
        const auth2 = createTokenAuth(options.auth);
        hook2.wrap("request", auth2.hook);
        this.auth = auth2;
      }
    } else {
      const { authStrategy, ...otherOptions } = options;
      const auth2 = authStrategy(
        Object.assign(
          {
            request: this.request,
            log: this.log,
            // we pass the current octokit instance as well as its constructor options
            // to allow for authentication strategies that return a new octokit instance
            // that shares the same internal state as the current one. The original
            // requirement for this was the "event-octokit" authentication strategy
            // of https://github.com/probot/octokit-auth-probot.
            octokit: this,
            octokitOptions: otherOptions
          },
          options.auth
        )
      );
      hook2.wrap("request", auth2.hook);
      this.auth = auth2;
    }
    const classConstructor = this.constructor;
    for (let i = 0; i < classConstructor.plugins.length; ++i) {
      Object.assign(this, classConstructor.plugins[i](this, options));
    }
  }
};

// node_modules/@octokit/plugin-request-log/dist-src/version.js
var VERSION5 = "4.0.0";

// node_modules/@octokit/plugin-request-log/dist-src/index.js
function requestLog(octokit) {
  octokit.hook.wrap("request", (request3, options) => {
    octokit.log.debug("request", options);
    const start = Date.now();
    const requestOptions = octokit.request.endpoint.parse(options);
    const path2 = requestOptions.url.replace(options.baseUrl, "");
    return request3(options).then((response) => {
      octokit.log.info(
        `${requestOptions.method} ${path2} - ${response.status} in ${Date.now() - start}ms`
      );
      return response;
    }).catch((error) => {
      octokit.log.info(
        `${requestOptions.method} ${path2} - ${error.status} in ${Date.now() - start}ms`
      );
      throw error;
    });
  });
}
requestLog.VERSION = VERSION5;

// node_modules/@octokit/plugin-paginate-rest/dist-web/index.js
var VERSION6 = "11.4.4-cjs.2";
function normalizePaginatedListResponse(response) {
  if (!response.data) {
    return {
      ...response,
      data: []
    };
  }
  const responseNeedsNormalization = "total_count" in response.data && !("url" in response.data);
  if (!responseNeedsNormalization) return response;
  const incompleteResults = response.data.incomplete_results;
  const repositorySelection = response.data.repository_selection;
  const totalCount = response.data.total_count;
  delete response.data.incomplete_results;
  delete response.data.repository_selection;
  delete response.data.total_count;
  const namespaceKey = Object.keys(response.data)[0];
  const data = response.data[namespaceKey];
  response.data = data;
  if (typeof incompleteResults !== "undefined") {
    response.data.incomplete_results = incompleteResults;
  }
  if (typeof repositorySelection !== "undefined") {
    response.data.repository_selection = repositorySelection;
  }
  response.data.total_count = totalCount;
  return response;
}
function iterator(octokit, route, parameters) {
  const options = typeof route === "function" ? route.endpoint(parameters) : octokit.request.endpoint(route, parameters);
  const requestMethod = typeof route === "function" ? route : octokit.request;
  const method = options.method;
  const headers = options.headers;
  let url = options.url;
  return {
    [Symbol.asyncIterator]: () => ({
      async next() {
        if (!url) return { done: true };
        try {
          const response = await requestMethod({ method, url, headers });
          const normalizedResponse = normalizePaginatedListResponse(response);
          url = ((normalizedResponse.headers.link || "").match(
            /<([^<>]+)>;\s*rel="next"/
          ) || [])[1];
          return { value: normalizedResponse };
        } catch (error) {
          if (error.status !== 409) throw error;
          url = "";
          return {
            value: {
              status: 200,
              headers: {},
              data: []
            }
          };
        }
      }
    })
  };
}
function paginate(octokit, route, parameters, mapFn) {
  if (typeof parameters === "function") {
    mapFn = parameters;
    parameters = void 0;
  }
  return gather(
    octokit,
    [],
    iterator(octokit, route, parameters)[Symbol.asyncIterator](),
    mapFn
  );
}
function gather(octokit, results, iterator2, mapFn) {
  return iterator2.next().then((result) => {
    if (result.done) {
      return results;
    }
    let earlyExit = false;
    function done() {
      earlyExit = true;
    }
    results = results.concat(
      mapFn ? mapFn(result.value, done) : result.value.data
    );
    if (earlyExit) {
      return results;
    }
    return gather(octokit, results, iterator2, mapFn);
  });
}
Object.assign(paginate, {
  iterator
});
function paginateRest(octokit) {
  return {
    paginate: Object.assign(paginate.bind(null, octokit), {
      iterator: iterator.bind(null, octokit)
    })
  };
}
paginateRest.VERSION = VERSION6;

// node_modules/@octokit/plugin-rest-endpoint-methods/dist-src/version.js
var VERSION7 = "13.3.2-cjs.1";

// node_modules/@octokit/plugin-rest-endpoint-methods/dist-src/generated/endpoints.js
var Endpoints = {
  actions: {
    addCustomLabelsToSelfHostedRunnerForOrg: [
      "POST /orgs/{org}/actions/runners/{runner_id}/labels"
    ],
    addCustomLabelsToSelfHostedRunnerForRepo: [
      "POST /repos/{owner}/{repo}/actions/runners/{runner_id}/labels"
    ],
    addRepoAccessToSelfHostedRunnerGroupInOrg: [
      "PUT /orgs/{org}/actions/runner-groups/{runner_group_id}/repositories/{repository_id}"
    ],
    addSelectedRepoToOrgSecret: [
      "PUT /orgs/{org}/actions/secrets/{secret_name}/repositories/{repository_id}"
    ],
    addSelectedRepoToOrgVariable: [
      "PUT /orgs/{org}/actions/variables/{name}/repositories/{repository_id}"
    ],
    approveWorkflowRun: [
      "POST /repos/{owner}/{repo}/actions/runs/{run_id}/approve"
    ],
    cancelWorkflowRun: [
      "POST /repos/{owner}/{repo}/actions/runs/{run_id}/cancel"
    ],
    createEnvironmentVariable: [
      "POST /repos/{owner}/{repo}/environments/{environment_name}/variables"
    ],
    createOrUpdateEnvironmentSecret: [
      "PUT /repos/{owner}/{repo}/environments/{environment_name}/secrets/{secret_name}"
    ],
    createOrUpdateOrgSecret: ["PUT /orgs/{org}/actions/secrets/{secret_name}"],
    createOrUpdateRepoSecret: [
      "PUT /repos/{owner}/{repo}/actions/secrets/{secret_name}"
    ],
    createOrgVariable: ["POST /orgs/{org}/actions/variables"],
    createRegistrationTokenForOrg: [
      "POST /orgs/{org}/actions/runners/registration-token"
    ],
    createRegistrationTokenForRepo: [
      "POST /repos/{owner}/{repo}/actions/runners/registration-token"
    ],
    createRemoveTokenForOrg: ["POST /orgs/{org}/actions/runners/remove-token"],
    createRemoveTokenForRepo: [
      "POST /repos/{owner}/{repo}/actions/runners/remove-token"
    ],
    createRepoVariable: ["POST /repos/{owner}/{repo}/actions/variables"],
    createWorkflowDispatch: [
      "POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches"
    ],
    deleteActionsCacheById: [
      "DELETE /repos/{owner}/{repo}/actions/caches/{cache_id}"
    ],
    deleteActionsCacheByKey: [
      "DELETE /repos/{owner}/{repo}/actions/caches{?key,ref}"
    ],
    deleteArtifact: [
      "DELETE /repos/{owner}/{repo}/actions/artifacts/{artifact_id}"
    ],
    deleteEnvironmentSecret: [
      "DELETE /repos/{owner}/{repo}/environments/{environment_name}/secrets/{secret_name}"
    ],
    deleteEnvironmentVariable: [
      "DELETE /repos/{owner}/{repo}/environments/{environment_name}/variables/{name}"
    ],
    deleteOrgSecret: ["DELETE /orgs/{org}/actions/secrets/{secret_name}"],
    deleteOrgVariable: ["DELETE /orgs/{org}/actions/variables/{name}"],
    deleteRepoSecret: [
      "DELETE /repos/{owner}/{repo}/actions/secrets/{secret_name}"
    ],
    deleteRepoVariable: [
      "DELETE /repos/{owner}/{repo}/actions/variables/{name}"
    ],
    deleteSelfHostedRunnerFromOrg: [
      "DELETE /orgs/{org}/actions/runners/{runner_id}"
    ],
    deleteSelfHostedRunnerFromRepo: [
      "DELETE /repos/{owner}/{repo}/actions/runners/{runner_id}"
    ],
    deleteWorkflowRun: ["DELETE /repos/{owner}/{repo}/actions/runs/{run_id}"],
    deleteWorkflowRunLogs: [
      "DELETE /repos/{owner}/{repo}/actions/runs/{run_id}/logs"
    ],
    disableSelectedRepositoryGithubActionsOrganization: [
      "DELETE /orgs/{org}/actions/permissions/repositories/{repository_id}"
    ],
    disableWorkflow: [
      "PUT /repos/{owner}/{repo}/actions/workflows/{workflow_id}/disable"
    ],
    downloadArtifact: [
      "GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}"
    ],
    downloadJobLogsForWorkflowRun: [
      "GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs"
    ],
    downloadWorkflowRunAttemptLogs: [
      "GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}/logs"
    ],
    downloadWorkflowRunLogs: [
      "GET /repos/{owner}/{repo}/actions/runs/{run_id}/logs"
    ],
    enableSelectedRepositoryGithubActionsOrganization: [
      "PUT /orgs/{org}/actions/permissions/repositories/{repository_id}"
    ],
    enableWorkflow: [
      "PUT /repos/{owner}/{repo}/actions/workflows/{workflow_id}/enable"
    ],
    forceCancelWorkflowRun: [
      "POST /repos/{owner}/{repo}/actions/runs/{run_id}/force-cancel"
    ],
    generateRunnerJitconfigForOrg: [
      "POST /orgs/{org}/actions/runners/generate-jitconfig"
    ],
    generateRunnerJitconfigForRepo: [
      "POST /repos/{owner}/{repo}/actions/runners/generate-jitconfig"
    ],
    getActionsCacheList: ["GET /repos/{owner}/{repo}/actions/caches"],
    getActionsCacheUsage: ["GET /repos/{owner}/{repo}/actions/cache/usage"],
    getActionsCacheUsageByRepoForOrg: [
      "GET /orgs/{org}/actions/cache/usage-by-repository"
    ],
    getActionsCacheUsageForOrg: ["GET /orgs/{org}/actions/cache/usage"],
    getAllowedActionsOrganization: [
      "GET /orgs/{org}/actions/permissions/selected-actions"
    ],
    getAllowedActionsRepository: [
      "GET /repos/{owner}/{repo}/actions/permissions/selected-actions"
    ],
    getArtifact: ["GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}"],
    getCustomOidcSubClaimForRepo: [
      "GET /repos/{owner}/{repo}/actions/oidc/customization/sub"
    ],
    getEnvironmentPublicKey: [
      "GET /repos/{owner}/{repo}/environments/{environment_name}/secrets/public-key"
    ],
    getEnvironmentSecret: [
      "GET /repos/{owner}/{repo}/environments/{environment_name}/secrets/{secret_name}"
    ],
    getEnvironmentVariable: [
      "GET /repos/{owner}/{repo}/environments/{environment_name}/variables/{name}"
    ],
    getGithubActionsDefaultWorkflowPermissionsOrganization: [
      "GET /orgs/{org}/actions/permissions/workflow"
    ],
    getGithubActionsDefaultWorkflowPermissionsRepository: [
      "GET /repos/{owner}/{repo}/actions/permissions/workflow"
    ],
    getGithubActionsPermissionsOrganization: [
      "GET /orgs/{org}/actions/permissions"
    ],
    getGithubActionsPermissionsRepository: [
      "GET /repos/{owner}/{repo}/actions/permissions"
    ],
    getJobForWorkflowRun: ["GET /repos/{owner}/{repo}/actions/jobs/{job_id}"],
    getOrgPublicKey: ["GET /orgs/{org}/actions/secrets/public-key"],
    getOrgSecret: ["GET /orgs/{org}/actions/secrets/{secret_name}"],
    getOrgVariable: ["GET /orgs/{org}/actions/variables/{name}"],
    getPendingDeploymentsForRun: [
      "GET /repos/{owner}/{repo}/actions/runs/{run_id}/pending_deployments"
    ],
    getRepoPermissions: [
      "GET /repos/{owner}/{repo}/actions/permissions",
      {},
      { renamed: ["actions", "getGithubActionsPermissionsRepository"] }
    ],
    getRepoPublicKey: ["GET /repos/{owner}/{repo}/actions/secrets/public-key"],
    getRepoSecret: ["GET /repos/{owner}/{repo}/actions/secrets/{secret_name}"],
    getRepoVariable: ["GET /repos/{owner}/{repo}/actions/variables/{name}"],
    getReviewsForRun: [
      "GET /repos/{owner}/{repo}/actions/runs/{run_id}/approvals"
    ],
    getSelfHostedRunnerForOrg: ["GET /orgs/{org}/actions/runners/{runner_id}"],
    getSelfHostedRunnerForRepo: [
      "GET /repos/{owner}/{repo}/actions/runners/{runner_id}"
    ],
    getWorkflow: ["GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}"],
    getWorkflowAccessToRepository: [
      "GET /repos/{owner}/{repo}/actions/permissions/access"
    ],
    getWorkflowRun: ["GET /repos/{owner}/{repo}/actions/runs/{run_id}"],
    getWorkflowRunAttempt: [
      "GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}"
    ],
    getWorkflowRunUsage: [
      "GET /repos/{owner}/{repo}/actions/runs/{run_id}/timing"
    ],
    getWorkflowUsage: [
      "GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/timing"
    ],
    listArtifactsForRepo: ["GET /repos/{owner}/{repo}/actions/artifacts"],
    listEnvironmentSecrets: [
      "GET /repos/{owner}/{repo}/environments/{environment_name}/secrets"
    ],
    listEnvironmentVariables: [
      "GET /repos/{owner}/{repo}/environments/{environment_name}/variables"
    ],
    listJobsForWorkflowRun: [
      "GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs"
    ],
    listJobsForWorkflowRunAttempt: [
      "GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}/jobs"
    ],
    listLabelsForSelfHostedRunnerForOrg: [
      "GET /orgs/{org}/actions/runners/{runner_id}/labels"
    ],
    listLabelsForSelfHostedRunnerForRepo: [
      "GET /repos/{owner}/{repo}/actions/runners/{runner_id}/labels"
    ],
    listOrgSecrets: ["GET /orgs/{org}/actions/secrets"],
    listOrgVariables: ["GET /orgs/{org}/actions/variables"],
    listRepoOrganizationSecrets: [
      "GET /repos/{owner}/{repo}/actions/organization-secrets"
    ],
    listRepoOrganizationVariables: [
      "GET /repos/{owner}/{repo}/actions/organization-variables"
    ],
    listRepoSecrets: ["GET /repos/{owner}/{repo}/actions/secrets"],
    listRepoVariables: ["GET /repos/{owner}/{repo}/actions/variables"],
    listRepoWorkflows: ["GET /repos/{owner}/{repo}/actions/workflows"],
    listRunnerApplicationsForOrg: ["GET /orgs/{org}/actions/runners/downloads"],
    listRunnerApplicationsForRepo: [
      "GET /repos/{owner}/{repo}/actions/runners/downloads"
    ],
    listSelectedReposForOrgSecret: [
      "GET /orgs/{org}/actions/secrets/{secret_name}/repositories"
    ],
    listSelectedReposForOrgVariable: [
      "GET /orgs/{org}/actions/variables/{name}/repositories"
    ],
    listSelectedRepositoriesEnabledGithubActionsOrganization: [
      "GET /orgs/{org}/actions/permissions/repositories"
    ],
    listSelfHostedRunnersForOrg: ["GET /orgs/{org}/actions/runners"],
    listSelfHostedRunnersForRepo: ["GET /repos/{owner}/{repo}/actions/runners"],
    listWorkflowRunArtifacts: [
      "GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts"
    ],
    listWorkflowRuns: [
      "GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs"
    ],
    listWorkflowRunsForRepo: ["GET /repos/{owner}/{repo}/actions/runs"],
    reRunJobForWorkflowRun: [
      "POST /repos/{owner}/{repo}/actions/jobs/{job_id}/rerun"
    ],
    reRunWorkflow: ["POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun"],
    reRunWorkflowFailedJobs: [
      "POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun-failed-jobs"
    ],
    removeAllCustomLabelsFromSelfHostedRunnerForOrg: [
      "DELETE /orgs/{org}/actions/runners/{runner_id}/labels"
    ],
    removeAllCustomLabelsFromSelfHostedRunnerForRepo: [
      "DELETE /repos/{owner}/{repo}/actions/runners/{runner_id}/labels"
    ],
    removeCustomLabelFromSelfHostedRunnerForOrg: [
      "DELETE /orgs/{org}/actions/runners/{runner_id}/labels/{name}"
    ],
    removeCustomLabelFromSelfHostedRunnerForRepo: [
      "DELETE /repos/{owner}/{repo}/actions/runners/{runner_id}/labels/{name}"
    ],
    removeSelectedRepoFromOrgSecret: [
      "DELETE /orgs/{org}/actions/secrets/{secret_name}/repositories/{repository_id}"
    ],
    removeSelectedRepoFromOrgVariable: [
      "DELETE /orgs/{org}/actions/variables/{name}/repositories/{repository_id}"
    ],
    reviewCustomGatesForRun: [
      "POST /repos/{owner}/{repo}/actions/runs/{run_id}/deployment_protection_rule"
    ],
    reviewPendingDeploymentsForRun: [
      "POST /repos/{owner}/{repo}/actions/runs/{run_id}/pending_deployments"
    ],
    setAllowedActionsOrganization: [
      "PUT /orgs/{org}/actions/permissions/selected-actions"
    ],
    setAllowedActionsRepository: [
      "PUT /repos/{owner}/{repo}/actions/permissions/selected-actions"
    ],
    setCustomLabelsForSelfHostedRunnerForOrg: [
      "PUT /orgs/{org}/actions/runners/{runner_id}/labels"
    ],
    setCustomLabelsForSelfHostedRunnerForRepo: [
      "PUT /repos/{owner}/{repo}/actions/runners/{runner_id}/labels"
    ],
    setCustomOidcSubClaimForRepo: [
      "PUT /repos/{owner}/{repo}/actions/oidc/customization/sub"
    ],
    setGithubActionsDefaultWorkflowPermissionsOrganization: [
      "PUT /orgs/{org}/actions/permissions/workflow"
    ],
    setGithubActionsDefaultWorkflowPermissionsRepository: [
      "PUT /repos/{owner}/{repo}/actions/permissions/workflow"
    ],
    setGithubActionsPermissionsOrganization: [
      "PUT /orgs/{org}/actions/permissions"
    ],
    setGithubActionsPermissionsRepository: [
      "PUT /repos/{owner}/{repo}/actions/permissions"
    ],
    setSelectedReposForOrgSecret: [
      "PUT /orgs/{org}/actions/secrets/{secret_name}/repositories"
    ],
    setSelectedReposForOrgVariable: [
      "PUT /orgs/{org}/actions/variables/{name}/repositories"
    ],
    setSelectedRepositoriesEnabledGithubActionsOrganization: [
      "PUT /orgs/{org}/actions/permissions/repositories"
    ],
    setWorkflowAccessToRepository: [
      "PUT /repos/{owner}/{repo}/actions/permissions/access"
    ],
    updateEnvironmentVariable: [
      "PATCH /repos/{owner}/{repo}/environments/{environment_name}/variables/{name}"
    ],
    updateOrgVariable: ["PATCH /orgs/{org}/actions/variables/{name}"],
    updateRepoVariable: [
      "PATCH /repos/{owner}/{repo}/actions/variables/{name}"
    ]
  },
  activity: {
    checkRepoIsStarredByAuthenticatedUser: ["GET /user/starred/{owner}/{repo}"],
    deleteRepoSubscription: ["DELETE /repos/{owner}/{repo}/subscription"],
    deleteThreadSubscription: [
      "DELETE /notifications/threads/{thread_id}/subscription"
    ],
    getFeeds: ["GET /feeds"],
    getRepoSubscription: ["GET /repos/{owner}/{repo}/subscription"],
    getThread: ["GET /notifications/threads/{thread_id}"],
    getThreadSubscriptionForAuthenticatedUser: [
      "GET /notifications/threads/{thread_id}/subscription"
    ],
    listEventsForAuthenticatedUser: ["GET /users/{username}/events"],
    listNotificationsForAuthenticatedUser: ["GET /notifications"],
    listOrgEventsForAuthenticatedUser: [
      "GET /users/{username}/events/orgs/{org}"
    ],
    listPublicEvents: ["GET /events"],
    listPublicEventsForRepoNetwork: ["GET /networks/{owner}/{repo}/events"],
    listPublicEventsForUser: ["GET /users/{username}/events/public"],
    listPublicOrgEvents: ["GET /orgs/{org}/events"],
    listReceivedEventsForUser: ["GET /users/{username}/received_events"],
    listReceivedPublicEventsForUser: [
      "GET /users/{username}/received_events/public"
    ],
    listRepoEvents: ["GET /repos/{owner}/{repo}/events"],
    listRepoNotificationsForAuthenticatedUser: [
      "GET /repos/{owner}/{repo}/notifications"
    ],
    listReposStarredByAuthenticatedUser: ["GET /user/starred"],
    listReposStarredByUser: ["GET /users/{username}/starred"],
    listReposWatchedByUser: ["GET /users/{username}/subscriptions"],
    listStargazersForRepo: ["GET /repos/{owner}/{repo}/stargazers"],
    listWatchedReposForAuthenticatedUser: ["GET /user/subscriptions"],
    listWatchersForRepo: ["GET /repos/{owner}/{repo}/subscribers"],
    markNotificationsAsRead: ["PUT /notifications"],
    markRepoNotificationsAsRead: ["PUT /repos/{owner}/{repo}/notifications"],
    markThreadAsDone: ["DELETE /notifications/threads/{thread_id}"],
    markThreadAsRead: ["PATCH /notifications/threads/{thread_id}"],
    setRepoSubscription: ["PUT /repos/{owner}/{repo}/subscription"],
    setThreadSubscription: [
      "PUT /notifications/threads/{thread_id}/subscription"
    ],
    starRepoForAuthenticatedUser: ["PUT /user/starred/{owner}/{repo}"],
    unstarRepoForAuthenticatedUser: ["DELETE /user/starred/{owner}/{repo}"]
  },
  apps: {
    addRepoToInstallation: [
      "PUT /user/installations/{installation_id}/repositories/{repository_id}",
      {},
      { renamed: ["apps", "addRepoToInstallationForAuthenticatedUser"] }
    ],
    addRepoToInstallationForAuthenticatedUser: [
      "PUT /user/installations/{installation_id}/repositories/{repository_id}"
    ],
    checkToken: ["POST /applications/{client_id}/token"],
    createFromManifest: ["POST /app-manifests/{code}/conversions"],
    createInstallationAccessToken: [
      "POST /app/installations/{installation_id}/access_tokens"
    ],
    deleteAuthorization: ["DELETE /applications/{client_id}/grant"],
    deleteInstallation: ["DELETE /app/installations/{installation_id}"],
    deleteToken: ["DELETE /applications/{client_id}/token"],
    getAuthenticated: ["GET /app"],
    getBySlug: ["GET /apps/{app_slug}"],
    getInstallation: ["GET /app/installations/{installation_id}"],
    getOrgInstallation: ["GET /orgs/{org}/installation"],
    getRepoInstallation: ["GET /repos/{owner}/{repo}/installation"],
    getSubscriptionPlanForAccount: [
      "GET /marketplace_listing/accounts/{account_id}"
    ],
    getSubscriptionPlanForAccountStubbed: [
      "GET /marketplace_listing/stubbed/accounts/{account_id}"
    ],
    getUserInstallation: ["GET /users/{username}/installation"],
    getWebhookConfigForApp: ["GET /app/hook/config"],
    getWebhookDelivery: ["GET /app/hook/deliveries/{delivery_id}"],
    listAccountsForPlan: ["GET /marketplace_listing/plans/{plan_id}/accounts"],
    listAccountsForPlanStubbed: [
      "GET /marketplace_listing/stubbed/plans/{plan_id}/accounts"
    ],
    listInstallationReposForAuthenticatedUser: [
      "GET /user/installations/{installation_id}/repositories"
    ],
    listInstallationRequestsForAuthenticatedApp: [
      "GET /app/installation-requests"
    ],
    listInstallations: ["GET /app/installations"],
    listInstallationsForAuthenticatedUser: ["GET /user/installations"],
    listPlans: ["GET /marketplace_listing/plans"],
    listPlansStubbed: ["GET /marketplace_listing/stubbed/plans"],
    listReposAccessibleToInstallation: ["GET /installation/repositories"],
    listSubscriptionsForAuthenticatedUser: ["GET /user/marketplace_purchases"],
    listSubscriptionsForAuthenticatedUserStubbed: [
      "GET /user/marketplace_purchases/stubbed"
    ],
    listWebhookDeliveries: ["GET /app/hook/deliveries"],
    redeliverWebhookDelivery: [
      "POST /app/hook/deliveries/{delivery_id}/attempts"
    ],
    removeRepoFromInstallation: [
      "DELETE /user/installations/{installation_id}/repositories/{repository_id}",
      {},
      { renamed: ["apps", "removeRepoFromInstallationForAuthenticatedUser"] }
    ],
    removeRepoFromInstallationForAuthenticatedUser: [
      "DELETE /user/installations/{installation_id}/repositories/{repository_id}"
    ],
    resetToken: ["PATCH /applications/{client_id}/token"],
    revokeInstallationAccessToken: ["DELETE /installation/token"],
    scopeToken: ["POST /applications/{client_id}/token/scoped"],
    suspendInstallation: ["PUT /app/installations/{installation_id}/suspended"],
    unsuspendInstallation: [
      "DELETE /app/installations/{installation_id}/suspended"
    ],
    updateWebhookConfigForApp: ["PATCH /app/hook/config"]
  },
  billing: {
    getGithubActionsBillingOrg: ["GET /orgs/{org}/settings/billing/actions"],
    getGithubActionsBillingUser: [
      "GET /users/{username}/settings/billing/actions"
    ],
    getGithubBillingUsageReportOrg: [
      "GET /organizations/{org}/settings/billing/usage"
    ],
    getGithubPackagesBillingOrg: ["GET /orgs/{org}/settings/billing/packages"],
    getGithubPackagesBillingUser: [
      "GET /users/{username}/settings/billing/packages"
    ],
    getSharedStorageBillingOrg: [
      "GET /orgs/{org}/settings/billing/shared-storage"
    ],
    getSharedStorageBillingUser: [
      "GET /users/{username}/settings/billing/shared-storage"
    ]
  },
  checks: {
    create: ["POST /repos/{owner}/{repo}/check-runs"],
    createSuite: ["POST /repos/{owner}/{repo}/check-suites"],
    get: ["GET /repos/{owner}/{repo}/check-runs/{check_run_id}"],
    getSuite: ["GET /repos/{owner}/{repo}/check-suites/{check_suite_id}"],
    listAnnotations: [
      "GET /repos/{owner}/{repo}/check-runs/{check_run_id}/annotations"
    ],
    listForRef: ["GET /repos/{owner}/{repo}/commits/{ref}/check-runs"],
    listForSuite: [
      "GET /repos/{owner}/{repo}/check-suites/{check_suite_id}/check-runs"
    ],
    listSuitesForRef: ["GET /repos/{owner}/{repo}/commits/{ref}/check-suites"],
    rerequestRun: [
      "POST /repos/{owner}/{repo}/check-runs/{check_run_id}/rerequest"
    ],
    rerequestSuite: [
      "POST /repos/{owner}/{repo}/check-suites/{check_suite_id}/rerequest"
    ],
    setSuitesPreferences: [
      "PATCH /repos/{owner}/{repo}/check-suites/preferences"
    ],
    update: ["PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}"]
  },
  codeScanning: {
    commitAutofix: [
      "POST /repos/{owner}/{repo}/code-scanning/alerts/{alert_number}/autofix/commits"
    ],
    createAutofix: [
      "POST /repos/{owner}/{repo}/code-scanning/alerts/{alert_number}/autofix"
    ],
    createVariantAnalysis: [
      "POST /repos/{owner}/{repo}/code-scanning/codeql/variant-analyses"
    ],
    deleteAnalysis: [
      "DELETE /repos/{owner}/{repo}/code-scanning/analyses/{analysis_id}{?confirm_delete}"
    ],
    deleteCodeqlDatabase: [
      "DELETE /repos/{owner}/{repo}/code-scanning/codeql/databases/{language}"
    ],
    getAlert: [
      "GET /repos/{owner}/{repo}/code-scanning/alerts/{alert_number}",
      {},
      { renamedParameters: { alert_id: "alert_number" } }
    ],
    getAnalysis: [
      "GET /repos/{owner}/{repo}/code-scanning/analyses/{analysis_id}"
    ],
    getAutofix: [
      "GET /repos/{owner}/{repo}/code-scanning/alerts/{alert_number}/autofix"
    ],
    getCodeqlDatabase: [
      "GET /repos/{owner}/{repo}/code-scanning/codeql/databases/{language}"
    ],
    getDefaultSetup: ["GET /repos/{owner}/{repo}/code-scanning/default-setup"],
    getSarif: ["GET /repos/{owner}/{repo}/code-scanning/sarifs/{sarif_id}"],
    getVariantAnalysis: [
      "GET /repos/{owner}/{repo}/code-scanning/codeql/variant-analyses/{codeql_variant_analysis_id}"
    ],
    getVariantAnalysisRepoTask: [
      "GET /repos/{owner}/{repo}/code-scanning/codeql/variant-analyses/{codeql_variant_analysis_id}/repos/{repo_owner}/{repo_name}"
    ],
    listAlertInstances: [
      "GET /repos/{owner}/{repo}/code-scanning/alerts/{alert_number}/instances"
    ],
    listAlertsForOrg: ["GET /orgs/{org}/code-scanning/alerts"],
    listAlertsForRepo: ["GET /repos/{owner}/{repo}/code-scanning/alerts"],
    listAlertsInstances: [
      "GET /repos/{owner}/{repo}/code-scanning/alerts/{alert_number}/instances",
      {},
      { renamed: ["codeScanning", "listAlertInstances"] }
    ],
    listCodeqlDatabases: [
      "GET /repos/{owner}/{repo}/code-scanning/codeql/databases"
    ],
    listRecentAnalyses: ["GET /repos/{owner}/{repo}/code-scanning/analyses"],
    updateAlert: [
      "PATCH /repos/{owner}/{repo}/code-scanning/alerts/{alert_number}"
    ],
    updateDefaultSetup: [
      "PATCH /repos/{owner}/{repo}/code-scanning/default-setup"
    ],
    uploadSarif: ["POST /repos/{owner}/{repo}/code-scanning/sarifs"]
  },
  codeSecurity: {
    attachConfiguration: [
      "POST /orgs/{org}/code-security/configurations/{configuration_id}/attach"
    ],
    attachEnterpriseConfiguration: [
      "POST /enterprises/{enterprise}/code-security/configurations/{configuration_id}/attach"
    ],
    createConfiguration: ["POST /orgs/{org}/code-security/configurations"],
    createConfigurationForEnterprise: [
      "POST /enterprises/{enterprise}/code-security/configurations"
    ],
    deleteConfiguration: [
      "DELETE /orgs/{org}/code-security/configurations/{configuration_id}"
    ],
    deleteConfigurationForEnterprise: [
      "DELETE /enterprises/{enterprise}/code-security/configurations/{configuration_id}"
    ],
    detachConfiguration: [
      "DELETE /orgs/{org}/code-security/configurations/detach"
    ],
    getConfiguration: [
      "GET /orgs/{org}/code-security/configurations/{configuration_id}"
    ],
    getConfigurationForRepository: [
      "GET /repos/{owner}/{repo}/code-security-configuration"
    ],
    getConfigurationsForEnterprise: [
      "GET /enterprises/{enterprise}/code-security/configurations"
    ],
    getConfigurationsForOrg: ["GET /orgs/{org}/code-security/configurations"],
    getDefaultConfigurations: [
      "GET /orgs/{org}/code-security/configurations/defaults"
    ],
    getDefaultConfigurationsForEnterprise: [
      "GET /enterprises/{enterprise}/code-security/configurations/defaults"
    ],
    getRepositoriesForConfiguration: [
      "GET /orgs/{org}/code-security/configurations/{configuration_id}/repositories"
    ],
    getRepositoriesForEnterpriseConfiguration: [
      "GET /enterprises/{enterprise}/code-security/configurations/{configuration_id}/repositories"
    ],
    getSingleConfigurationForEnterprise: [
      "GET /enterprises/{enterprise}/code-security/configurations/{configuration_id}"
    ],
    setConfigurationAsDefault: [
      "PUT /orgs/{org}/code-security/configurations/{configuration_id}/defaults"
    ],
    setConfigurationAsDefaultForEnterprise: [
      "PUT /enterprises/{enterprise}/code-security/configurations/{configuration_id}/defaults"
    ],
    updateConfiguration: [
      "PATCH /orgs/{org}/code-security/configurations/{configuration_id}"
    ],
    updateEnterpriseConfiguration: [
      "PATCH /enterprises/{enterprise}/code-security/configurations/{configuration_id}"
    ]
  },
  codesOfConduct: {
    getAllCodesOfConduct: ["GET /codes_of_conduct"],
    getConductCode: ["GET /codes_of_conduct/{key}"]
  },
  codespaces: {
    addRepositoryForSecretForAuthenticatedUser: [
      "PUT /user/codespaces/secrets/{secret_name}/repositories/{repository_id}"
    ],
    addSelectedRepoToOrgSecret: [
      "PUT /orgs/{org}/codespaces/secrets/{secret_name}/repositories/{repository_id}"
    ],
    checkPermissionsForDevcontainer: [
      "GET /repos/{owner}/{repo}/codespaces/permissions_check"
    ],
    codespaceMachinesForAuthenticatedUser: [
      "GET /user/codespaces/{codespace_name}/machines"
    ],
    createForAuthenticatedUser: ["POST /user/codespaces"],
    createOrUpdateOrgSecret: [
      "PUT /orgs/{org}/codespaces/secrets/{secret_name}"
    ],
    createOrUpdateRepoSecret: [
      "PUT /repos/{owner}/{repo}/codespaces/secrets/{secret_name}"
    ],
    createOrUpdateSecretForAuthenticatedUser: [
      "PUT /user/codespaces/secrets/{secret_name}"
    ],
    createWithPrForAuthenticatedUser: [
      "POST /repos/{owner}/{repo}/pulls/{pull_number}/codespaces"
    ],
    createWithRepoForAuthenticatedUser: [
      "POST /repos/{owner}/{repo}/codespaces"
    ],
    deleteForAuthenticatedUser: ["DELETE /user/codespaces/{codespace_name}"],
    deleteFromOrganization: [
      "DELETE /orgs/{org}/members/{username}/codespaces/{codespace_name}"
    ],
    deleteOrgSecret: ["DELETE /orgs/{org}/codespaces/secrets/{secret_name}"],
    deleteRepoSecret: [
      "DELETE /repos/{owner}/{repo}/codespaces/secrets/{secret_name}"
    ],
    deleteSecretForAuthenticatedUser: [
      "DELETE /user/codespaces/secrets/{secret_name}"
    ],
    exportForAuthenticatedUser: [
      "POST /user/codespaces/{codespace_name}/exports"
    ],
    getCodespacesForUserInOrg: [
      "GET /orgs/{org}/members/{username}/codespaces"
    ],
    getExportDetailsForAuthenticatedUser: [
      "GET /user/codespaces/{codespace_name}/exports/{export_id}"
    ],
    getForAuthenticatedUser: ["GET /user/codespaces/{codespace_name}"],
    getOrgPublicKey: ["GET /orgs/{org}/codespaces/secrets/public-key"],
    getOrgSecret: ["GET /orgs/{org}/codespaces/secrets/{secret_name}"],
    getPublicKeyForAuthenticatedUser: [
      "GET /user/codespaces/secrets/public-key"
    ],
    getRepoPublicKey: [
      "GET /repos/{owner}/{repo}/codespaces/secrets/public-key"
    ],
    getRepoSecret: [
      "GET /repos/{owner}/{repo}/codespaces/secrets/{secret_name}"
    ],
    getSecretForAuthenticatedUser: [
      "GET /user/codespaces/secrets/{secret_name}"
    ],
    listDevcontainersInRepositoryForAuthenticatedUser: [
      "GET /repos/{owner}/{repo}/codespaces/devcontainers"
    ],
    listForAuthenticatedUser: ["GET /user/codespaces"],
    listInOrganization: [
      "GET /orgs/{org}/codespaces",
      {},
      { renamedParameters: { org_id: "org" } }
    ],
    listInRepositoryForAuthenticatedUser: [
      "GET /repos/{owner}/{repo}/codespaces"
    ],
    listOrgSecrets: ["GET /orgs/{org}/codespaces/secrets"],
    listRepoSecrets: ["GET /repos/{owner}/{repo}/codespaces/secrets"],
    listRepositoriesForSecretForAuthenticatedUser: [
      "GET /user/codespaces/secrets/{secret_name}/repositories"
    ],
    listSecretsForAuthenticatedUser: ["GET /user/codespaces/secrets"],
    listSelectedReposForOrgSecret: [
      "GET /orgs/{org}/codespaces/secrets/{secret_name}/repositories"
    ],
    preFlightWithRepoForAuthenticatedUser: [
      "GET /repos/{owner}/{repo}/codespaces/new"
    ],
    publishForAuthenticatedUser: [
      "POST /user/codespaces/{codespace_name}/publish"
    ],
    removeRepositoryForSecretForAuthenticatedUser: [
      "DELETE /user/codespaces/secrets/{secret_name}/repositories/{repository_id}"
    ],
    removeSelectedRepoFromOrgSecret: [
      "DELETE /orgs/{org}/codespaces/secrets/{secret_name}/repositories/{repository_id}"
    ],
    repoMachinesForAuthenticatedUser: [
      "GET /repos/{owner}/{repo}/codespaces/machines"
    ],
    setRepositoriesForSecretForAuthenticatedUser: [
      "PUT /user/codespaces/secrets/{secret_name}/repositories"
    ],
    setSelectedReposForOrgSecret: [
      "PUT /orgs/{org}/codespaces/secrets/{secret_name}/repositories"
    ],
    startForAuthenticatedUser: ["POST /user/codespaces/{codespace_name}/start"],
    stopForAuthenticatedUser: ["POST /user/codespaces/{codespace_name}/stop"],
    stopInOrganization: [
      "POST /orgs/{org}/members/{username}/codespaces/{codespace_name}/stop"
    ],
    updateForAuthenticatedUser: ["PATCH /user/codespaces/{codespace_name}"]
  },
  copilot: {
    addCopilotSeatsForTeams: [
      "POST /orgs/{org}/copilot/billing/selected_teams"
    ],
    addCopilotSeatsForUsers: [
      "POST /orgs/{org}/copilot/billing/selected_users"
    ],
    cancelCopilotSeatAssignmentForTeams: [
      "DELETE /orgs/{org}/copilot/billing/selected_teams"
    ],
    cancelCopilotSeatAssignmentForUsers: [
      "DELETE /orgs/{org}/copilot/billing/selected_users"
    ],
    copilotMetricsForOrganization: ["GET /orgs/{org}/copilot/metrics"],
    copilotMetricsForTeam: ["GET /orgs/{org}/team/{team_slug}/copilot/metrics"],
    getCopilotOrganizationDetails: ["GET /orgs/{org}/copilot/billing"],
    getCopilotSeatDetailsForUser: [
      "GET /orgs/{org}/members/{username}/copilot"
    ],
    listCopilotSeats: ["GET /orgs/{org}/copilot/billing/seats"],
    usageMetricsForOrg: ["GET /orgs/{org}/copilot/usage"],
    usageMetricsForTeam: ["GET /orgs/{org}/team/{team_slug}/copilot/usage"]
  },
  dependabot: {
    addSelectedRepoToOrgSecret: [
      "PUT /orgs/{org}/dependabot/secrets/{secret_name}/repositories/{repository_id}"
    ],
    createOrUpdateOrgSecret: [
      "PUT /orgs/{org}/dependabot/secrets/{secret_name}"
    ],
    createOrUpdateRepoSecret: [
      "PUT /repos/{owner}/{repo}/dependabot/secrets/{secret_name}"
    ],
    deleteOrgSecret: ["DELETE /orgs/{org}/dependabot/secrets/{secret_name}"],
    deleteRepoSecret: [
      "DELETE /repos/{owner}/{repo}/dependabot/secrets/{secret_name}"
    ],
    getAlert: ["GET /repos/{owner}/{repo}/dependabot/alerts/{alert_number}"],
    getOrgPublicKey: ["GET /orgs/{org}/dependabot/secrets/public-key"],
    getOrgSecret: ["GET /orgs/{org}/dependabot/secrets/{secret_name}"],
    getRepoPublicKey: [
      "GET /repos/{owner}/{repo}/dependabot/secrets/public-key"
    ],
    getRepoSecret: [
      "GET /repos/{owner}/{repo}/dependabot/secrets/{secret_name}"
    ],
    listAlertsForEnterprise: [
      "GET /enterprises/{enterprise}/dependabot/alerts"
    ],
    listAlertsForOrg: ["GET /orgs/{org}/dependabot/alerts"],
    listAlertsForRepo: ["GET /repos/{owner}/{repo}/dependabot/alerts"],
    listOrgSecrets: ["GET /orgs/{org}/dependabot/secrets"],
    listRepoSecrets: ["GET /repos/{owner}/{repo}/dependabot/secrets"],
    listSelectedReposForOrgSecret: [
      "GET /orgs/{org}/dependabot/secrets/{secret_name}/repositories"
    ],
    removeSelectedRepoFromOrgSecret: [
      "DELETE /orgs/{org}/dependabot/secrets/{secret_name}/repositories/{repository_id}"
    ],
    setSelectedReposForOrgSecret: [
      "PUT /orgs/{org}/dependabot/secrets/{secret_name}/repositories"
    ],
    updateAlert: [
      "PATCH /repos/{owner}/{repo}/dependabot/alerts/{alert_number}"
    ]
  },
  dependencyGraph: {
    createRepositorySnapshot: [
      "POST /repos/{owner}/{repo}/dependency-graph/snapshots"
    ],
    diffRange: [
      "GET /repos/{owner}/{repo}/dependency-graph/compare/{basehead}"
    ],
    exportSbom: ["GET /repos/{owner}/{repo}/dependency-graph/sbom"]
  },
  emojis: { get: ["GET /emojis"] },
  gists: {
    checkIsStarred: ["GET /gists/{gist_id}/star"],
    create: ["POST /gists"],
    createComment: ["POST /gists/{gist_id}/comments"],
    delete: ["DELETE /gists/{gist_id}"],
    deleteComment: ["DELETE /gists/{gist_id}/comments/{comment_id}"],
    fork: ["POST /gists/{gist_id}/forks"],
    get: ["GET /gists/{gist_id}"],
    getComment: ["GET /gists/{gist_id}/comments/{comment_id}"],
    getRevision: ["GET /gists/{gist_id}/{sha}"],
    list: ["GET /gists"],
    listComments: ["GET /gists/{gist_id}/comments"],
    listCommits: ["GET /gists/{gist_id}/commits"],
    listForUser: ["GET /users/{username}/gists"],
    listForks: ["GET /gists/{gist_id}/forks"],
    listPublic: ["GET /gists/public"],
    listStarred: ["GET /gists/starred"],
    star: ["PUT /gists/{gist_id}/star"],
    unstar: ["DELETE /gists/{gist_id}/star"],
    update: ["PATCH /gists/{gist_id}"],
    updateComment: ["PATCH /gists/{gist_id}/comments/{comment_id}"]
  },
  git: {
    createBlob: ["POST /repos/{owner}/{repo}/git/blobs"],
    createCommit: ["POST /repos/{owner}/{repo}/git/commits"],
    createRef: ["POST /repos/{owner}/{repo}/git/refs"],
    createTag: ["POST /repos/{owner}/{repo}/git/tags"],
    createTree: ["POST /repos/{owner}/{repo}/git/trees"],
    deleteRef: ["DELETE /repos/{owner}/{repo}/git/refs/{ref}"],
    getBlob: ["GET /repos/{owner}/{repo}/git/blobs/{file_sha}"],
    getCommit: ["GET /repos/{owner}/{repo}/git/commits/{commit_sha}"],
    getRef: ["GET /repos/{owner}/{repo}/git/ref/{ref}"],
    getTag: ["GET /repos/{owner}/{repo}/git/tags/{tag_sha}"],
    getTree: ["GET /repos/{owner}/{repo}/git/trees/{tree_sha}"],
    listMatchingRefs: ["GET /repos/{owner}/{repo}/git/matching-refs/{ref}"],
    updateRef: ["PATCH /repos/{owner}/{repo}/git/refs/{ref}"]
  },
  gitignore: {
    getAllTemplates: ["GET /gitignore/templates"],
    getTemplate: ["GET /gitignore/templates/{name}"]
  },
  interactions: {
    getRestrictionsForAuthenticatedUser: ["GET /user/interaction-limits"],
    getRestrictionsForOrg: ["GET /orgs/{org}/interaction-limits"],
    getRestrictionsForRepo: ["GET /repos/{owner}/{repo}/interaction-limits"],
    getRestrictionsForYourPublicRepos: [
      "GET /user/interaction-limits",
      {},
      { renamed: ["interactions", "getRestrictionsForAuthenticatedUser"] }
    ],
    removeRestrictionsForAuthenticatedUser: ["DELETE /user/interaction-limits"],
    removeRestrictionsForOrg: ["DELETE /orgs/{org}/interaction-limits"],
    removeRestrictionsForRepo: [
      "DELETE /repos/{owner}/{repo}/interaction-limits"
    ],
    removeRestrictionsForYourPublicRepos: [
      "DELETE /user/interaction-limits",
      {},
      { renamed: ["interactions", "removeRestrictionsForAuthenticatedUser"] }
    ],
    setRestrictionsForAuthenticatedUser: ["PUT /user/interaction-limits"],
    setRestrictionsForOrg: ["PUT /orgs/{org}/interaction-limits"],
    setRestrictionsForRepo: ["PUT /repos/{owner}/{repo}/interaction-limits"],
    setRestrictionsForYourPublicRepos: [
      "PUT /user/interaction-limits",
      {},
      { renamed: ["interactions", "setRestrictionsForAuthenticatedUser"] }
    ]
  },
  issues: {
    addAssignees: [
      "POST /repos/{owner}/{repo}/issues/{issue_number}/assignees"
    ],
    addLabels: ["POST /repos/{owner}/{repo}/issues/{issue_number}/labels"],
    addSubIssue: [
      "POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues"
    ],
    checkUserCanBeAssigned: ["GET /repos/{owner}/{repo}/assignees/{assignee}"],
    checkUserCanBeAssignedToIssue: [
      "GET /repos/{owner}/{repo}/issues/{issue_number}/assignees/{assignee}"
    ],
    create: ["POST /repos/{owner}/{repo}/issues"],
    createComment: [
      "POST /repos/{owner}/{repo}/issues/{issue_number}/comments"
    ],
    createLabel: ["POST /repos/{owner}/{repo}/labels"],
    createMilestone: ["POST /repos/{owner}/{repo}/milestones"],
    deleteComment: [
      "DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}"
    ],
    deleteLabel: ["DELETE /repos/{owner}/{repo}/labels/{name}"],
    deleteMilestone: [
      "DELETE /repos/{owner}/{repo}/milestones/{milestone_number}"
    ],
    get: ["GET /repos/{owner}/{repo}/issues/{issue_number}"],
    getComment: ["GET /repos/{owner}/{repo}/issues/comments/{comment_id}"],
    getEvent: ["GET /repos/{owner}/{repo}/issues/events/{event_id}"],
    getLabel: ["GET /repos/{owner}/{repo}/labels/{name}"],
    getMilestone: ["GET /repos/{owner}/{repo}/milestones/{milestone_number}"],
    list: ["GET /issues"],
    listAssignees: ["GET /repos/{owner}/{repo}/assignees"],
    listComments: ["GET /repos/{owner}/{repo}/issues/{issue_number}/comments"],
    listCommentsForRepo: ["GET /repos/{owner}/{repo}/issues/comments"],
    listEvents: ["GET /repos/{owner}/{repo}/issues/{issue_number}/events"],
    listEventsForRepo: ["GET /repos/{owner}/{repo}/issues/events"],
    listEventsForTimeline: [
      "GET /repos/{owner}/{repo}/issues/{issue_number}/timeline"
    ],
    listForAuthenticatedUser: ["GET /user/issues"],
    listForOrg: ["GET /orgs/{org}/issues"],
    listForRepo: ["GET /repos/{owner}/{repo}/issues"],
    listLabelsForMilestone: [
      "GET /repos/{owner}/{repo}/milestones/{milestone_number}/labels"
    ],
    listLabelsForRepo: ["GET /repos/{owner}/{repo}/labels"],
    listLabelsOnIssue: [
      "GET /repos/{owner}/{repo}/issues/{issue_number}/labels"
    ],
    listMilestones: ["GET /repos/{owner}/{repo}/milestones"],
    listSubIssues: [
      "GET /repos/{owner}/{repo}/issues/{issue_number}/sub_issues"
    ],
    lock: ["PUT /repos/{owner}/{repo}/issues/{issue_number}/lock"],
    removeAllLabels: [
      "DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels"
    ],
    removeAssignees: [
      "DELETE /repos/{owner}/{repo}/issues/{issue_number}/assignees"
    ],
    removeLabel: [
      "DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels/{name}"
    ],
    removeSubIssue: [
      "DELETE /repos/{owner}/{repo}/issues/{issue_number}/sub_issue"
    ],
    reprioritizeSubIssue: [
      "PATCH /repos/{owner}/{repo}/issues/{issue_number}/sub_issues/priority"
    ],
    setLabels: ["PUT /repos/{owner}/{repo}/issues/{issue_number}/labels"],
    unlock: ["DELETE /repos/{owner}/{repo}/issues/{issue_number}/lock"],
    update: ["PATCH /repos/{owner}/{repo}/issues/{issue_number}"],
    updateComment: ["PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}"],
    updateLabel: ["PATCH /repos/{owner}/{repo}/labels/{name}"],
    updateMilestone: [
      "PATCH /repos/{owner}/{repo}/milestones/{milestone_number}"
    ]
  },
  licenses: {
    get: ["GET /licenses/{license}"],
    getAllCommonlyUsed: ["GET /licenses"],
    getForRepo: ["GET /repos/{owner}/{repo}/license"]
  },
  markdown: {
    render: ["POST /markdown"],
    renderRaw: [
      "POST /markdown/raw",
      { headers: { "content-type": "text/plain; charset=utf-8" } }
    ]
  },
  meta: {
    get: ["GET /meta"],
    getAllVersions: ["GET /versions"],
    getOctocat: ["GET /octocat"],
    getZen: ["GET /zen"],
    root: ["GET /"]
  },
  migrations: {
    deleteArchiveForAuthenticatedUser: [
      "DELETE /user/migrations/{migration_id}/archive"
    ],
    deleteArchiveForOrg: [
      "DELETE /orgs/{org}/migrations/{migration_id}/archive"
    ],
    downloadArchiveForOrg: [
      "GET /orgs/{org}/migrations/{migration_id}/archive"
    ],
    getArchiveForAuthenticatedUser: [
      "GET /user/migrations/{migration_id}/archive"
    ],
    getStatusForAuthenticatedUser: ["GET /user/migrations/{migration_id}"],
    getStatusForOrg: ["GET /orgs/{org}/migrations/{migration_id}"],
    listForAuthenticatedUser: ["GET /user/migrations"],
    listForOrg: ["GET /orgs/{org}/migrations"],
    listReposForAuthenticatedUser: [
      "GET /user/migrations/{migration_id}/repositories"
    ],
    listReposForOrg: ["GET /orgs/{org}/migrations/{migration_id}/repositories"],
    listReposForUser: [
      "GET /user/migrations/{migration_id}/repositories",
      {},
      { renamed: ["migrations", "listReposForAuthenticatedUser"] }
    ],
    startForAuthenticatedUser: ["POST /user/migrations"],
    startForOrg: ["POST /orgs/{org}/migrations"],
    unlockRepoForAuthenticatedUser: [
      "DELETE /user/migrations/{migration_id}/repos/{repo_name}/lock"
    ],
    unlockRepoForOrg: [
      "DELETE /orgs/{org}/migrations/{migration_id}/repos/{repo_name}/lock"
    ]
  },
  oidc: {
    getOidcCustomSubTemplateForOrg: [
      "GET /orgs/{org}/actions/oidc/customization/sub"
    ],
    updateOidcCustomSubTemplateForOrg: [
      "PUT /orgs/{org}/actions/oidc/customization/sub"
    ]
  },
  orgs: {
    addSecurityManagerTeam: [
      "PUT /orgs/{org}/security-managers/teams/{team_slug}",
      {},
      {
        deprecated: "octokit.rest.orgs.addSecurityManagerTeam() is deprecated, see https://docs.github.com/rest/orgs/security-managers#add-a-security-manager-team"
      }
    ],
    assignTeamToOrgRole: [
      "PUT /orgs/{org}/organization-roles/teams/{team_slug}/{role_id}"
    ],
    assignUserToOrgRole: [
      "PUT /orgs/{org}/organization-roles/users/{username}/{role_id}"
    ],
    blockUser: ["PUT /orgs/{org}/blocks/{username}"],
    cancelInvitation: ["DELETE /orgs/{org}/invitations/{invitation_id}"],
    checkBlockedUser: ["GET /orgs/{org}/blocks/{username}"],
    checkMembershipForUser: ["GET /orgs/{org}/members/{username}"],
    checkPublicMembershipForUser: ["GET /orgs/{org}/public_members/{username}"],
    convertMemberToOutsideCollaborator: [
      "PUT /orgs/{org}/outside_collaborators/{username}"
    ],
    createInvitation: ["POST /orgs/{org}/invitations"],
    createOrUpdateCustomProperties: ["PATCH /orgs/{org}/properties/schema"],
    createOrUpdateCustomPropertiesValuesForRepos: [
      "PATCH /orgs/{org}/properties/values"
    ],
    createOrUpdateCustomProperty: [
      "PUT /orgs/{org}/properties/schema/{custom_property_name}"
    ],
    createWebhook: ["POST /orgs/{org}/hooks"],
    delete: ["DELETE /orgs/{org}"],
    deleteWebhook: ["DELETE /orgs/{org}/hooks/{hook_id}"],
    enableOrDisableSecurityProductOnAllOrgRepos: [
      "POST /orgs/{org}/{security_product}/{enablement}",
      {},
      {
        deprecated: "octokit.rest.orgs.enableOrDisableSecurityProductOnAllOrgRepos() is deprecated, see https://docs.github.com/rest/orgs/orgs#enable-or-disable-a-security-feature-for-an-organization"
      }
    ],
    get: ["GET /orgs/{org}"],
    getAllCustomProperties: ["GET /orgs/{org}/properties/schema"],
    getCustomProperty: [
      "GET /orgs/{org}/properties/schema/{custom_property_name}"
    ],
    getMembershipForAuthenticatedUser: ["GET /user/memberships/orgs/{org}"],
    getMembershipForUser: ["GET /orgs/{org}/memberships/{username}"],
    getOrgRole: ["GET /orgs/{org}/organization-roles/{role_id}"],
    getWebhook: ["GET /orgs/{org}/hooks/{hook_id}"],
    getWebhookConfigForOrg: ["GET /orgs/{org}/hooks/{hook_id}/config"],
    getWebhookDelivery: [
      "GET /orgs/{org}/hooks/{hook_id}/deliveries/{delivery_id}"
    ],
    list: ["GET /organizations"],
    listAppInstallations: ["GET /orgs/{org}/installations"],
    listAttestations: ["GET /orgs/{org}/attestations/{subject_digest}"],
    listBlockedUsers: ["GET /orgs/{org}/blocks"],
    listCustomPropertiesValuesForRepos: ["GET /orgs/{org}/properties/values"],
    listFailedInvitations: ["GET /orgs/{org}/failed_invitations"],
    listForAuthenticatedUser: ["GET /user/orgs"],
    listForUser: ["GET /users/{username}/orgs"],
    listInvitationTeams: ["GET /orgs/{org}/invitations/{invitation_id}/teams"],
    listMembers: ["GET /orgs/{org}/members"],
    listMembershipsForAuthenticatedUser: ["GET /user/memberships/orgs"],
    listOrgRoleTeams: ["GET /orgs/{org}/organization-roles/{role_id}/teams"],
    listOrgRoleUsers: ["GET /orgs/{org}/organization-roles/{role_id}/users"],
    listOrgRoles: ["GET /orgs/{org}/organization-roles"],
    listOrganizationFineGrainedPermissions: [
      "GET /orgs/{org}/organization-fine-grained-permissions"
    ],
    listOutsideCollaborators: ["GET /orgs/{org}/outside_collaborators"],
    listPatGrantRepositories: [
      "GET /orgs/{org}/personal-access-tokens/{pat_id}/repositories"
    ],
    listPatGrantRequestRepositories: [
      "GET /orgs/{org}/personal-access-token-requests/{pat_request_id}/repositories"
    ],
    listPatGrantRequests: ["GET /orgs/{org}/personal-access-token-requests"],
    listPatGrants: ["GET /orgs/{org}/personal-access-tokens"],
    listPendingInvitations: ["GET /orgs/{org}/invitations"],
    listPublicMembers: ["GET /orgs/{org}/public_members"],
    listSecurityManagerTeams: [
      "GET /orgs/{org}/security-managers",
      {},
      {
        deprecated: "octokit.rest.orgs.listSecurityManagerTeams() is deprecated, see https://docs.github.com/rest/orgs/security-managers#list-security-manager-teams"
      }
    ],
    listWebhookDeliveries: ["GET /orgs/{org}/hooks/{hook_id}/deliveries"],
    listWebhooks: ["GET /orgs/{org}/hooks"],
    pingWebhook: ["POST /orgs/{org}/hooks/{hook_id}/pings"],
    redeliverWebhookDelivery: [
      "POST /orgs/{org}/hooks/{hook_id}/deliveries/{delivery_id}/attempts"
    ],
    removeCustomProperty: [
      "DELETE /orgs/{org}/properties/schema/{custom_property_name}"
    ],
    removeMember: ["DELETE /orgs/{org}/members/{username}"],
    removeMembershipForUser: ["DELETE /orgs/{org}/memberships/{username}"],
    removeOutsideCollaborator: [
      "DELETE /orgs/{org}/outside_collaborators/{username}"
    ],
    removePublicMembershipForAuthenticatedUser: [
      "DELETE /orgs/{org}/public_members/{username}"
    ],
    removeSecurityManagerTeam: [
      "DELETE /orgs/{org}/security-managers/teams/{team_slug}",
      {},
      {
        deprecated: "octokit.rest.orgs.removeSecurityManagerTeam() is deprecated, see https://docs.github.com/rest/orgs/security-managers#remove-a-security-manager-team"
      }
    ],
    reviewPatGrantRequest: [
      "POST /orgs/{org}/personal-access-token-requests/{pat_request_id}"
    ],
    reviewPatGrantRequestsInBulk: [
      "POST /orgs/{org}/personal-access-token-requests"
    ],
    revokeAllOrgRolesTeam: [
      "DELETE /orgs/{org}/organization-roles/teams/{team_slug}"
    ],
    revokeAllOrgRolesUser: [
      "DELETE /orgs/{org}/organization-roles/users/{username}"
    ],
    revokeOrgRoleTeam: [
      "DELETE /orgs/{org}/organization-roles/teams/{team_slug}/{role_id}"
    ],
    revokeOrgRoleUser: [
      "DELETE /orgs/{org}/organization-roles/users/{username}/{role_id}"
    ],
    setMembershipForUser: ["PUT /orgs/{org}/memberships/{username}"],
    setPublicMembershipForAuthenticatedUser: [
      "PUT /orgs/{org}/public_members/{username}"
    ],
    unblockUser: ["DELETE /orgs/{org}/blocks/{username}"],
    update: ["PATCH /orgs/{org}"],
    updateMembershipForAuthenticatedUser: [
      "PATCH /user/memberships/orgs/{org}"
    ],
    updatePatAccess: ["POST /orgs/{org}/personal-access-tokens/{pat_id}"],
    updatePatAccesses: ["POST /orgs/{org}/personal-access-tokens"],
    updateWebhook: ["PATCH /orgs/{org}/hooks/{hook_id}"],
    updateWebhookConfigForOrg: ["PATCH /orgs/{org}/hooks/{hook_id}/config"]
  },
  packages: {
    deletePackageForAuthenticatedUser: [
      "DELETE /user/packages/{package_type}/{package_name}"
    ],
    deletePackageForOrg: [
      "DELETE /orgs/{org}/packages/{package_type}/{package_name}"
    ],
    deletePackageForUser: [
      "DELETE /users/{username}/packages/{package_type}/{package_name}"
    ],
    deletePackageVersionForAuthenticatedUser: [
      "DELETE /user/packages/{package_type}/{package_name}/versions/{package_version_id}"
    ],
    deletePackageVersionForOrg: [
      "DELETE /orgs/{org}/packages/{package_type}/{package_name}/versions/{package_version_id}"
    ],
    deletePackageVersionForUser: [
      "DELETE /users/{username}/packages/{package_type}/{package_name}/versions/{package_version_id}"
    ],
    getAllPackageVersionsForAPackageOwnedByAnOrg: [
      "GET /orgs/{org}/packages/{package_type}/{package_name}/versions",
      {},
      { renamed: ["packages", "getAllPackageVersionsForPackageOwnedByOrg"] }
    ],
    getAllPackageVersionsForAPackageOwnedByTheAuthenticatedUser: [
      "GET /user/packages/{package_type}/{package_name}/versions",
      {},
      {
        renamed: [
          "packages",
          "getAllPackageVersionsForPackageOwnedByAuthenticatedUser"
        ]
      }
    ],
    getAllPackageVersionsForPackageOwnedByAuthenticatedUser: [
      "GET /user/packages/{package_type}/{package_name}/versions"
    ],
    getAllPackageVersionsForPackageOwnedByOrg: [
      "GET /orgs/{org}/packages/{package_type}/{package_name}/versions"
    ],
    getAllPackageVersionsForPackageOwnedByUser: [
      "GET /users/{username}/packages/{package_type}/{package_name}/versions"
    ],
    getPackageForAuthenticatedUser: [
      "GET /user/packages/{package_type}/{package_name}"
    ],
    getPackageForOrganization: [
      "GET /orgs/{org}/packages/{package_type}/{package_name}"
    ],
    getPackageForUser: [
      "GET /users/{username}/packages/{package_type}/{package_name}"
    ],
    getPackageVersionForAuthenticatedUser: [
      "GET /user/packages/{package_type}/{package_name}/versions/{package_version_id}"
    ],
    getPackageVersionForOrganization: [
      "GET /orgs/{org}/packages/{package_type}/{package_name}/versions/{package_version_id}"
    ],
    getPackageVersionForUser: [
      "GET /users/{username}/packages/{package_type}/{package_name}/versions/{package_version_id}"
    ],
    listDockerMigrationConflictingPackagesForAuthenticatedUser: [
      "GET /user/docker/conflicts"
    ],
    listDockerMigrationConflictingPackagesForOrganization: [
      "GET /orgs/{org}/docker/conflicts"
    ],
    listDockerMigrationConflictingPackagesForUser: [
      "GET /users/{username}/docker/conflicts"
    ],
    listPackagesForAuthenticatedUser: ["GET /user/packages"],
    listPackagesForOrganization: ["GET /orgs/{org}/packages"],
    listPackagesForUser: ["GET /users/{username}/packages"],
    restorePackageForAuthenticatedUser: [
      "POST /user/packages/{package_type}/{package_name}/restore{?token}"
    ],
    restorePackageForOrg: [
      "POST /orgs/{org}/packages/{package_type}/{package_name}/restore{?token}"
    ],
    restorePackageForUser: [
      "POST /users/{username}/packages/{package_type}/{package_name}/restore{?token}"
    ],
    restorePackageVersionForAuthenticatedUser: [
      "POST /user/packages/{package_type}/{package_name}/versions/{package_version_id}/restore"
    ],
    restorePackageVersionForOrg: [
      "POST /orgs/{org}/packages/{package_type}/{package_name}/versions/{package_version_id}/restore"
    ],
    restorePackageVersionForUser: [
      "POST /users/{username}/packages/{package_type}/{package_name}/versions/{package_version_id}/restore"
    ]
  },
  privateRegistries: {
    createOrgPrivateRegistry: ["POST /orgs/{org}/private-registries"],
    deleteOrgPrivateRegistry: [
      "DELETE /orgs/{org}/private-registries/{secret_name}"
    ],
    getOrgPrivateRegistry: ["GET /orgs/{org}/private-registries/{secret_name}"],
    getOrgPublicKey: ["GET /orgs/{org}/private-registries/public-key"],
    listOrgPrivateRegistries: ["GET /orgs/{org}/private-registries"],
    updateOrgPrivateRegistry: [
      "PATCH /orgs/{org}/private-registries/{secret_name}"
    ]
  },
  projects: {
    addCollaborator: ["PUT /projects/{project_id}/collaborators/{username}"],
    createCard: ["POST /projects/columns/{column_id}/cards"],
    createColumn: ["POST /projects/{project_id}/columns"],
    createForAuthenticatedUser: ["POST /user/projects"],
    createForOrg: ["POST /orgs/{org}/projects"],
    createForRepo: ["POST /repos/{owner}/{repo}/projects"],
    delete: ["DELETE /projects/{project_id}"],
    deleteCard: ["DELETE /projects/columns/cards/{card_id}"],
    deleteColumn: ["DELETE /projects/columns/{column_id}"],
    get: ["GET /projects/{project_id}"],
    getCard: ["GET /projects/columns/cards/{card_id}"],
    getColumn: ["GET /projects/columns/{column_id}"],
    getPermissionForUser: [
      "GET /projects/{project_id}/collaborators/{username}/permission"
    ],
    listCards: ["GET /projects/columns/{column_id}/cards"],
    listCollaborators: ["GET /projects/{project_id}/collaborators"],
    listColumns: ["GET /projects/{project_id}/columns"],
    listForOrg: ["GET /orgs/{org}/projects"],
    listForRepo: ["GET /repos/{owner}/{repo}/projects"],
    listForUser: ["GET /users/{username}/projects"],
    moveCard: ["POST /projects/columns/cards/{card_id}/moves"],
    moveColumn: ["POST /projects/columns/{column_id}/moves"],
    removeCollaborator: [
      "DELETE /projects/{project_id}/collaborators/{username}"
    ],
    update: ["PATCH /projects/{project_id}"],
    updateCard: ["PATCH /projects/columns/cards/{card_id}"],
    updateColumn: ["PATCH /projects/columns/{column_id}"]
  },
  pulls: {
    checkIfMerged: ["GET /repos/{owner}/{repo}/pulls/{pull_number}/merge"],
    create: ["POST /repos/{owner}/{repo}/pulls"],
    createReplyForReviewComment: [
      "POST /repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies"
    ],
    createReview: ["POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews"],
    createReviewComment: [
      "POST /repos/{owner}/{repo}/pulls/{pull_number}/comments"
    ],
    deletePendingReview: [
      "DELETE /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}"
    ],
    deleteReviewComment: [
      "DELETE /repos/{owner}/{repo}/pulls/comments/{comment_id}"
    ],
    dismissReview: [
      "PUT /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/dismissals"
    ],
    get: ["GET /repos/{owner}/{repo}/pulls/{pull_number}"],
    getReview: [
      "GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}"
    ],
    getReviewComment: ["GET /repos/{owner}/{repo}/pulls/comments/{comment_id}"],
    list: ["GET /repos/{owner}/{repo}/pulls"],
    listCommentsForReview: [
      "GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/comments"
    ],
    listCommits: ["GET /repos/{owner}/{repo}/pulls/{pull_number}/commits"],
    listFiles: ["GET /repos/{owner}/{repo}/pulls/{pull_number}/files"],
    listRequestedReviewers: [
      "GET /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers"
    ],
    listReviewComments: [
      "GET /repos/{owner}/{repo}/pulls/{pull_number}/comments"
    ],
    listReviewCommentsForRepo: ["GET /repos/{owner}/{repo}/pulls/comments"],
    listReviews: ["GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews"],
    merge: ["PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge"],
    removeRequestedReviewers: [
      "DELETE /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers"
    ],
    requestReviewers: [
      "POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers"
    ],
    submitReview: [
      "POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/events"
    ],
    update: ["PATCH /repos/{owner}/{repo}/pulls/{pull_number}"],
    updateBranch: [
      "PUT /repos/{owner}/{repo}/pulls/{pull_number}/update-branch"
    ],
    updateReview: [
      "PUT /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}"
    ],
    updateReviewComment: [
      "PATCH /repos/{owner}/{repo}/pulls/comments/{comment_id}"
    ]
  },
  rateLimit: { get: ["GET /rate_limit"] },
  reactions: {
    createForCommitComment: [
      "POST /repos/{owner}/{repo}/comments/{comment_id}/reactions"
    ],
    createForIssue: [
      "POST /repos/{owner}/{repo}/issues/{issue_number}/reactions"
    ],
    createForIssueComment: [
      "POST /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions"
    ],
    createForPullRequestReviewComment: [
      "POST /repos/{owner}/{repo}/pulls/comments/{comment_id}/reactions"
    ],
    createForRelease: [
      "POST /repos/{owner}/{repo}/releases/{release_id}/reactions"
    ],
    createForTeamDiscussionCommentInOrg: [
      "POST /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments/{comment_number}/reactions"
    ],
    createForTeamDiscussionInOrg: [
      "POST /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/reactions"
    ],
    deleteForCommitComment: [
      "DELETE /repos/{owner}/{repo}/comments/{comment_id}/reactions/{reaction_id}"
    ],
    deleteForIssue: [
      "DELETE /repos/{owner}/{repo}/issues/{issue_number}/reactions/{reaction_id}"
    ],
    deleteForIssueComment: [
      "DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions/{reaction_id}"
    ],
    deleteForPullRequestComment: [
      "DELETE /repos/{owner}/{repo}/pulls/comments/{comment_id}/reactions/{reaction_id}"
    ],
    deleteForRelease: [
      "DELETE /repos/{owner}/{repo}/releases/{release_id}/reactions/{reaction_id}"
    ],
    deleteForTeamDiscussion: [
      "DELETE /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/reactions/{reaction_id}"
    ],
    deleteForTeamDiscussionComment: [
      "DELETE /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments/{comment_number}/reactions/{reaction_id}"
    ],
    listForCommitComment: [
      "GET /repos/{owner}/{repo}/comments/{comment_id}/reactions"
    ],
    listForIssue: ["GET /repos/{owner}/{repo}/issues/{issue_number}/reactions"],
    listForIssueComment: [
      "GET /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions"
    ],
    listForPullRequestReviewComment: [
      "GET /repos/{owner}/{repo}/pulls/comments/{comment_id}/reactions"
    ],
    listForRelease: [
      "GET /repos/{owner}/{repo}/releases/{release_id}/reactions"
    ],
    listForTeamDiscussionCommentInOrg: [
      "GET /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments/{comment_number}/reactions"
    ],
    listForTeamDiscussionInOrg: [
      "GET /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/reactions"
    ]
  },
  repos: {
    acceptInvitation: [
      "PATCH /user/repository_invitations/{invitation_id}",
      {},
      { renamed: ["repos", "acceptInvitationForAuthenticatedUser"] }
    ],
    acceptInvitationForAuthenticatedUser: [
      "PATCH /user/repository_invitations/{invitation_id}"
    ],
    addAppAccessRestrictions: [
      "POST /repos/{owner}/{repo}/branches/{branch}/protection/restrictions/apps",
      {},
      { mapToData: "apps" }
    ],
    addCollaborator: ["PUT /repos/{owner}/{repo}/collaborators/{username}"],
    addStatusCheckContexts: [
      "POST /repos/{owner}/{repo}/branches/{branch}/protection/required_status_checks/contexts",
      {},
      { mapToData: "contexts" }
    ],
    addTeamAccessRestrictions: [
      "POST /repos/{owner}/{repo}/branches/{branch}/protection/restrictions/teams",
      {},
      { mapToData: "teams" }
    ],
    addUserAccessRestrictions: [
      "POST /repos/{owner}/{repo}/branches/{branch}/protection/restrictions/users",
      {},
      { mapToData: "users" }
    ],
    cancelPagesDeployment: [
      "POST /repos/{owner}/{repo}/pages/deployments/{pages_deployment_id}/cancel"
    ],
    checkAutomatedSecurityFixes: [
      "GET /repos/{owner}/{repo}/automated-security-fixes"
    ],
    checkCollaborator: ["GET /repos/{owner}/{repo}/collaborators/{username}"],
    checkPrivateVulnerabilityReporting: [
      "GET /repos/{owner}/{repo}/private-vulnerability-reporting"
    ],
    checkVulnerabilityAlerts: [
      "GET /repos/{owner}/{repo}/vulnerability-alerts"
    ],
    codeownersErrors: ["GET /repos/{owner}/{repo}/codeowners/errors"],
    compareCommits: ["GET /repos/{owner}/{repo}/compare/{base}...{head}"],
    compareCommitsWithBasehead: [
      "GET /repos/{owner}/{repo}/compare/{basehead}"
    ],
    createAttestation: ["POST /repos/{owner}/{repo}/attestations"],
    createAutolink: ["POST /repos/{owner}/{repo}/autolinks"],
    createCommitComment: [
      "POST /repos/{owner}/{repo}/commits/{commit_sha}/comments"
    ],
    createCommitSignatureProtection: [
      "POST /repos/{owner}/{repo}/branches/{branch}/protection/required_signatures"
    ],
    createCommitStatus: ["POST /repos/{owner}/{repo}/statuses/{sha}"],
    createDeployKey: ["POST /repos/{owner}/{repo}/keys"],
    createDeployment: ["POST /repos/{owner}/{repo}/deployments"],
    createDeploymentBranchPolicy: [
      "POST /repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies"
    ],
    createDeploymentProtectionRule: [
      "POST /repos/{owner}/{repo}/environments/{environment_name}/deployment_protection_rules"
    ],
    createDeploymentStatus: [
      "POST /repos/{owner}/{repo}/deployments/{deployment_id}/statuses"
    ],
    createDispatchEvent: ["POST /repos/{owner}/{repo}/dispatches"],
    createForAuthenticatedUser: ["POST /user/repos"],
    createFork: ["POST /repos/{owner}/{repo}/forks"],
    createInOrg: ["POST /orgs/{org}/repos"],
    createOrUpdateCustomPropertiesValues: [
      "PATCH /repos/{owner}/{repo}/properties/values"
    ],
    createOrUpdateEnvironment: [
      "PUT /repos/{owner}/{repo}/environments/{environment_name}"
    ],
    createOrUpdateFileContents: ["PUT /repos/{owner}/{repo}/contents/{path}"],
    createOrgRuleset: ["POST /orgs/{org}/rulesets"],
    createPagesDeployment: ["POST /repos/{owner}/{repo}/pages/deployments"],
    createPagesSite: ["POST /repos/{owner}/{repo}/pages"],
    createRelease: ["POST /repos/{owner}/{repo}/releases"],
    createRepoRuleset: ["POST /repos/{owner}/{repo}/rulesets"],
    createUsingTemplate: [
      "POST /repos/{template_owner}/{template_repo}/generate"
    ],
    createWebhook: ["POST /repos/{owner}/{repo}/hooks"],
    declineInvitation: [
      "DELETE /user/repository_invitations/{invitation_id}",
      {},
      { renamed: ["repos", "declineInvitationForAuthenticatedUser"] }
    ],
    declineInvitationForAuthenticatedUser: [
      "DELETE /user/repository_invitations/{invitation_id}"
    ],
    delete: ["DELETE /repos/{owner}/{repo}"],
    deleteAccessRestrictions: [
      "DELETE /repos/{owner}/{repo}/branches/{branch}/protection/restrictions"
    ],
    deleteAdminBranchProtection: [
      "DELETE /repos/{owner}/{repo}/branches/{branch}/protection/enforce_admins"
    ],
    deleteAnEnvironment: [
      "DELETE /repos/{owner}/{repo}/environments/{environment_name}"
    ],
    deleteAutolink: ["DELETE /repos/{owner}/{repo}/autolinks/{autolink_id}"],
    deleteBranchProtection: [
      "DELETE /repos/{owner}/{repo}/branches/{branch}/protection"
    ],
    deleteCommitComment: ["DELETE /repos/{owner}/{repo}/comments/{comment_id}"],
    deleteCommitSignatureProtection: [
      "DELETE /repos/{owner}/{repo}/branches/{branch}/protection/required_signatures"
    ],
    deleteDeployKey: ["DELETE /repos/{owner}/{repo}/keys/{key_id}"],
    deleteDeployment: [
      "DELETE /repos/{owner}/{repo}/deployments/{deployment_id}"
    ],
    deleteDeploymentBranchPolicy: [
      "DELETE /repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies/{branch_policy_id}"
    ],
    deleteFile: ["DELETE /repos/{owner}/{repo}/contents/{path}"],
    deleteInvitation: [
      "DELETE /repos/{owner}/{repo}/invitations/{invitation_id}"
    ],
    deleteOrgRuleset: ["DELETE /orgs/{org}/rulesets/{ruleset_id}"],
    deletePagesSite: ["DELETE /repos/{owner}/{repo}/pages"],
    deletePullRequestReviewProtection: [
      "DELETE /repos/{owner}/{repo}/branches/{branch}/protection/required_pull_request_reviews"
    ],
    deleteRelease: ["DELETE /repos/{owner}/{repo}/releases/{release_id}"],
    deleteReleaseAsset: [
      "DELETE /repos/{owner}/{repo}/releases/assets/{asset_id}"
    ],
    deleteRepoRuleset: ["DELETE /repos/{owner}/{repo}/rulesets/{ruleset_id}"],
    deleteWebhook: ["DELETE /repos/{owner}/{repo}/hooks/{hook_id}"],
    disableAutomatedSecurityFixes: [
      "DELETE /repos/{owner}/{repo}/automated-security-fixes"
    ],
    disableDeploymentProtectionRule: [
      "DELETE /repos/{owner}/{repo}/environments/{environment_name}/deployment_protection_rules/{protection_rule_id}"
    ],
    disablePrivateVulnerabilityReporting: [
      "DELETE /repos/{owner}/{repo}/private-vulnerability-reporting"
    ],
    disableVulnerabilityAlerts: [
      "DELETE /repos/{owner}/{repo}/vulnerability-alerts"
    ],
    downloadArchive: [
      "GET /repos/{owner}/{repo}/zipball/{ref}",
      {},
      { renamed: ["repos", "downloadZipballArchive"] }
    ],
    downloadTarballArchive: ["GET /repos/{owner}/{repo}/tarball/{ref}"],
    downloadZipballArchive: ["GET /repos/{owner}/{repo}/zipball/{ref}"],
    enableAutomatedSecurityFixes: [
      "PUT /repos/{owner}/{repo}/automated-security-fixes"
    ],
    enablePrivateVulnerabilityReporting: [
      "PUT /repos/{owner}/{repo}/private-vulnerability-reporting"
    ],
    enableVulnerabilityAlerts: [
      "PUT /repos/{owner}/{repo}/vulnerability-alerts"
    ],
    generateReleaseNotes: [
      "POST /repos/{owner}/{repo}/releases/generate-notes"
    ],
    get: ["GET /repos/{owner}/{repo}"],
    getAccessRestrictions: [
      "GET /repos/{owner}/{repo}/branches/{branch}/protection/restrictions"
    ],
    getAdminBranchProtection: [
      "GET /repos/{owner}/{repo}/branches/{branch}/protection/enforce_admins"
    ],
    getAllDeploymentProtectionRules: [
      "GET /repos/{owner}/{repo}/environments/{environment_name}/deployment_protection_rules"
    ],
    getAllEnvironments: ["GET /repos/{owner}/{repo}/environments"],
    getAllStatusCheckContexts: [
      "GET /repos/{owner}/{repo}/branches/{branch}/protection/required_status_checks/contexts"
    ],
    getAllTopics: ["GET /repos/{owner}/{repo}/topics"],
    getAppsWithAccessToProtectedBranch: [
      "GET /repos/{owner}/{repo}/branches/{branch}/protection/restrictions/apps"
    ],
    getAutolink: ["GET /repos/{owner}/{repo}/autolinks/{autolink_id}"],
    getBranch: ["GET /repos/{owner}/{repo}/branches/{branch}"],
    getBranchProtection: [
      "GET /repos/{owner}/{repo}/branches/{branch}/protection"
    ],
    getBranchRules: ["GET /repos/{owner}/{repo}/rules/branches/{branch}"],
    getClones: ["GET /repos/{owner}/{repo}/traffic/clones"],
    getCodeFrequencyStats: ["GET /repos/{owner}/{repo}/stats/code_frequency"],
    getCollaboratorPermissionLevel: [
      "GET /repos/{owner}/{repo}/collaborators/{username}/permission"
    ],
    getCombinedStatusForRef: ["GET /repos/{owner}/{repo}/commits/{ref}/status"],
    getCommit: ["GET /repos/{owner}/{repo}/commits/{ref}"],
    getCommitActivityStats: ["GET /repos/{owner}/{repo}/stats/commit_activity"],
    getCommitComment: ["GET /repos/{owner}/{repo}/comments/{comment_id}"],
    getCommitSignatureProtection: [
      "GET /repos/{owner}/{repo}/branches/{branch}/protection/required_signatures"
    ],
    getCommunityProfileMetrics: ["GET /repos/{owner}/{repo}/community/profile"],
    getContent: ["GET /repos/{owner}/{repo}/contents/{path}"],
    getContributorsStats: ["GET /repos/{owner}/{repo}/stats/contributors"],
    getCustomDeploymentProtectionRule: [
      "GET /repos/{owner}/{repo}/environments/{environment_name}/deployment_protection_rules/{protection_rule_id}"
    ],
    getCustomPropertiesValues: ["GET /repos/{owner}/{repo}/properties/values"],
    getDeployKey: ["GET /repos/{owner}/{repo}/keys/{key_id}"],
    getDeployment: ["GET /repos/{owner}/{repo}/deployments/{deployment_id}"],
    getDeploymentBranchPolicy: [
      "GET /repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies/{branch_policy_id}"
    ],
    getDeploymentStatus: [
      "GET /repos/{owner}/{repo}/deployments/{deployment_id}/statuses/{status_id}"
    ],
    getEnvironment: [
      "GET /repos/{owner}/{repo}/environments/{environment_name}"
    ],
    getLatestPagesBuild: ["GET /repos/{owner}/{repo}/pages/builds/latest"],
    getLatestRelease: ["GET /repos/{owner}/{repo}/releases/latest"],
    getOrgRuleSuite: ["GET /orgs/{org}/rulesets/rule-suites/{rule_suite_id}"],
    getOrgRuleSuites: ["GET /orgs/{org}/rulesets/rule-suites"],
    getOrgRuleset: ["GET /orgs/{org}/rulesets/{ruleset_id}"],
    getOrgRulesets: ["GET /orgs/{org}/rulesets"],
    getPages: ["GET /repos/{owner}/{repo}/pages"],
    getPagesBuild: ["GET /repos/{owner}/{repo}/pages/builds/{build_id}"],
    getPagesDeployment: [
      "GET /repos/{owner}/{repo}/pages/deployments/{pages_deployment_id}"
    ],
    getPagesHealthCheck: ["GET /repos/{owner}/{repo}/pages/health"],
    getParticipationStats: ["GET /repos/{owner}/{repo}/stats/participation"],
    getPullRequestReviewProtection: [
      "GET /repos/{owner}/{repo}/branches/{branch}/protection/required_pull_request_reviews"
    ],
    getPunchCardStats: ["GET /repos/{owner}/{repo}/stats/punch_card"],
    getReadme: ["GET /repos/{owner}/{repo}/readme"],
    getReadmeInDirectory: ["GET /repos/{owner}/{repo}/readme/{dir}"],
    getRelease: ["GET /repos/{owner}/{repo}/releases/{release_id}"],
    getReleaseAsset: ["GET /repos/{owner}/{repo}/releases/assets/{asset_id}"],
    getReleaseByTag: ["GET /repos/{owner}/{repo}/releases/tags/{tag}"],
    getRepoRuleSuite: [
      "GET /repos/{owner}/{repo}/rulesets/rule-suites/{rule_suite_id}"
    ],
    getRepoRuleSuites: ["GET /repos/{owner}/{repo}/rulesets/rule-suites"],
    getRepoRuleset: ["GET /repos/{owner}/{repo}/rulesets/{ruleset_id}"],
    getRepoRulesets: ["GET /repos/{owner}/{repo}/rulesets"],
    getStatusChecksProtection: [
      "GET /repos/{owner}/{repo}/branches/{branch}/protection/required_status_checks"
    ],
    getTeamsWithAccessToProtectedBranch: [
      "GET /repos/{owner}/{repo}/branches/{branch}/protection/restrictions/teams"
    ],
    getTopPaths: ["GET /repos/{owner}/{repo}/traffic/popular/paths"],
    getTopReferrers: ["GET /repos/{owner}/{repo}/traffic/popular/referrers"],
    getUsersWithAccessToProtectedBranch: [
      "GET /repos/{owner}/{repo}/branches/{branch}/protection/restrictions/users"
    ],
    getViews: ["GET /repos/{owner}/{repo}/traffic/views"],
    getWebhook: ["GET /repos/{owner}/{repo}/hooks/{hook_id}"],
    getWebhookConfigForRepo: [
      "GET /repos/{owner}/{repo}/hooks/{hook_id}/config"
    ],
    getWebhookDelivery: [
      "GET /repos/{owner}/{repo}/hooks/{hook_id}/deliveries/{delivery_id}"
    ],
    listActivities: ["GET /repos/{owner}/{repo}/activity"],
    listAttestations: [
      "GET /repos/{owner}/{repo}/attestations/{subject_digest}"
    ],
    listAutolinks: ["GET /repos/{owner}/{repo}/autolinks"],
    listBranches: ["GET /repos/{owner}/{repo}/branches"],
    listBranchesForHeadCommit: [
      "GET /repos/{owner}/{repo}/commits/{commit_sha}/branches-where-head"
    ],
    listCollaborators: ["GET /repos/{owner}/{repo}/collaborators"],
    listCommentsForCommit: [
      "GET /repos/{owner}/{repo}/commits/{commit_sha}/comments"
    ],
    listCommitCommentsForRepo: ["GET /repos/{owner}/{repo}/comments"],
    listCommitStatusesForRef: [
      "GET /repos/{owner}/{repo}/commits/{ref}/statuses"
    ],
    listCommits: ["GET /repos/{owner}/{repo}/commits"],
    listContributors: ["GET /repos/{owner}/{repo}/contributors"],
    listCustomDeploymentRuleIntegrations: [
      "GET /repos/{owner}/{repo}/environments/{environment_name}/deployment_protection_rules/apps"
    ],
    listDeployKeys: ["GET /repos/{owner}/{repo}/keys"],
    listDeploymentBranchPolicies: [
      "GET /repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies"
    ],
    listDeploymentStatuses: [
      "GET /repos/{owner}/{repo}/deployments/{deployment_id}/statuses"
    ],
    listDeployments: ["GET /repos/{owner}/{repo}/deployments"],
    listForAuthenticatedUser: ["GET /user/repos"],
    listForOrg: ["GET /orgs/{org}/repos"],
    listForUser: ["GET /users/{username}/repos"],
    listForks: ["GET /repos/{owner}/{repo}/forks"],
    listInvitations: ["GET /repos/{owner}/{repo}/invitations"],
    listInvitationsForAuthenticatedUser: ["GET /user/repository_invitations"],
    listLanguages: ["GET /repos/{owner}/{repo}/languages"],
    listPagesBuilds: ["GET /repos/{owner}/{repo}/pages/builds"],
    listPublic: ["GET /repositories"],
    listPullRequestsAssociatedWithCommit: [
      "GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls"
    ],
    listReleaseAssets: [
      "GET /repos/{owner}/{repo}/releases/{release_id}/assets"
    ],
    listReleases: ["GET /repos/{owner}/{repo}/releases"],
    listTags: ["GET /repos/{owner}/{repo}/tags"],
    listTeams: ["GET /repos/{owner}/{repo}/teams"],
    listWebhookDeliveries: [
      "GET /repos/{owner}/{repo}/hooks/{hook_id}/deliveries"
    ],
    listWebhooks: ["GET /repos/{owner}/{repo}/hooks"],
    merge: ["POST /repos/{owner}/{repo}/merges"],
    mergeUpstream: ["POST /repos/{owner}/{repo}/merge-upstream"],
    pingWebhook: ["POST /repos/{owner}/{repo}/hooks/{hook_id}/pings"],
    redeliverWebhookDelivery: [
      "POST /repos/{owner}/{repo}/hooks/{hook_id}/deliveries/{delivery_id}/attempts"
    ],
    removeAppAccessRestrictions: [
      "DELETE /repos/{owner}/{repo}/branches/{branch}/protection/restrictions/apps",
      {},
      { mapToData: "apps" }
    ],
    removeCollaborator: [
      "DELETE /repos/{owner}/{repo}/collaborators/{username}"
    ],
    removeStatusCheckContexts: [
      "DELETE /repos/{owner}/{repo}/branches/{branch}/protection/required_status_checks/contexts",
      {},
      { mapToData: "contexts" }
    ],
    removeStatusCheckProtection: [
      "DELETE /repos/{owner}/{repo}/branches/{branch}/protection/required_status_checks"
    ],
    removeTeamAccessRestrictions: [
      "DELETE /repos/{owner}/{repo}/branches/{branch}/protection/restrictions/teams",
      {},
      { mapToData: "teams" }
    ],
    removeUserAccessRestrictions: [
      "DELETE /repos/{owner}/{repo}/branches/{branch}/protection/restrictions/users",
      {},
      { mapToData: "users" }
    ],
    renameBranch: ["POST /repos/{owner}/{repo}/branches/{branch}/rename"],
    replaceAllTopics: ["PUT /repos/{owner}/{repo}/topics"],
    requestPagesBuild: ["POST /repos/{owner}/{repo}/pages/builds"],
    setAdminBranchProtection: [
      "POST /repos/{owner}/{repo}/branches/{branch}/protection/enforce_admins"
    ],
    setAppAccessRestrictions: [
      "PUT /repos/{owner}/{repo}/branches/{branch}/protection/restrictions/apps",
      {},
      { mapToData: "apps" }
    ],
    setStatusCheckContexts: [
      "PUT /repos/{owner}/{repo}/branches/{branch}/protection/required_status_checks/contexts",
      {},
      { mapToData: "contexts" }
    ],
    setTeamAccessRestrictions: [
      "PUT /repos/{owner}/{repo}/branches/{branch}/protection/restrictions/teams",
      {},
      { mapToData: "teams" }
    ],
    setUserAccessRestrictions: [
      "PUT /repos/{owner}/{repo}/branches/{branch}/protection/restrictions/users",
      {},
      { mapToData: "users" }
    ],
    testPushWebhook: ["POST /repos/{owner}/{repo}/hooks/{hook_id}/tests"],
    transfer: ["POST /repos/{owner}/{repo}/transfer"],
    update: ["PATCH /repos/{owner}/{repo}"],
    updateBranchProtection: [
      "PUT /repos/{owner}/{repo}/branches/{branch}/protection"
    ],
    updateCommitComment: ["PATCH /repos/{owner}/{repo}/comments/{comment_id}"],
    updateDeploymentBranchPolicy: [
      "PUT /repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies/{branch_policy_id}"
    ],
    updateInformationAboutPagesSite: ["PUT /repos/{owner}/{repo}/pages"],
    updateInvitation: [
      "PATCH /repos/{owner}/{repo}/invitations/{invitation_id}"
    ],
    updateOrgRuleset: ["PUT /orgs/{org}/rulesets/{ruleset_id}"],
    updatePullRequestReviewProtection: [
      "PATCH /repos/{owner}/{repo}/branches/{branch}/protection/required_pull_request_reviews"
    ],
    updateRelease: ["PATCH /repos/{owner}/{repo}/releases/{release_id}"],
    updateReleaseAsset: [
      "PATCH /repos/{owner}/{repo}/releases/assets/{asset_id}"
    ],
    updateRepoRuleset: ["PUT /repos/{owner}/{repo}/rulesets/{ruleset_id}"],
    updateStatusCheckPotection: [
      "PATCH /repos/{owner}/{repo}/branches/{branch}/protection/required_status_checks",
      {},
      { renamed: ["repos", "updateStatusCheckProtection"] }
    ],
    updateStatusCheckProtection: [
      "PATCH /repos/{owner}/{repo}/branches/{branch}/protection/required_status_checks"
    ],
    updateWebhook: ["PATCH /repos/{owner}/{repo}/hooks/{hook_id}"],
    updateWebhookConfigForRepo: [
      "PATCH /repos/{owner}/{repo}/hooks/{hook_id}/config"
    ],
    uploadReleaseAsset: [
      "POST /repos/{owner}/{repo}/releases/{release_id}/assets{?name,label}",
      { baseUrl: "https://uploads.github.com" }
    ]
  },
  search: {
    code: ["GET /search/code"],
    commits: ["GET /search/commits"],
    issuesAndPullRequests: ["GET /search/issues"],
    labels: ["GET /search/labels"],
    repos: ["GET /search/repositories"],
    topics: ["GET /search/topics"],
    users: ["GET /search/users"]
  },
  secretScanning: {
    createPushProtectionBypass: [
      "POST /repos/{owner}/{repo}/secret-scanning/push-protection-bypasses"
    ],
    getAlert: [
      "GET /repos/{owner}/{repo}/secret-scanning/alerts/{alert_number}"
    ],
    getScanHistory: ["GET /repos/{owner}/{repo}/secret-scanning/scan-history"],
    listAlertsForEnterprise: [
      "GET /enterprises/{enterprise}/secret-scanning/alerts"
    ],
    listAlertsForOrg: ["GET /orgs/{org}/secret-scanning/alerts"],
    listAlertsForRepo: ["GET /repos/{owner}/{repo}/secret-scanning/alerts"],
    listLocationsForAlert: [
      "GET /repos/{owner}/{repo}/secret-scanning/alerts/{alert_number}/locations"
    ],
    updateAlert: [
      "PATCH /repos/{owner}/{repo}/secret-scanning/alerts/{alert_number}"
    ]
  },
  securityAdvisories: {
    createFork: [
      "POST /repos/{owner}/{repo}/security-advisories/{ghsa_id}/forks"
    ],
    createPrivateVulnerabilityReport: [
      "POST /repos/{owner}/{repo}/security-advisories/reports"
    ],
    createRepositoryAdvisory: [
      "POST /repos/{owner}/{repo}/security-advisories"
    ],
    createRepositoryAdvisoryCveRequest: [
      "POST /repos/{owner}/{repo}/security-advisories/{ghsa_id}/cve"
    ],
    getGlobalAdvisory: ["GET /advisories/{ghsa_id}"],
    getRepositoryAdvisory: [
      "GET /repos/{owner}/{repo}/security-advisories/{ghsa_id}"
    ],
    listGlobalAdvisories: ["GET /advisories"],
    listOrgRepositoryAdvisories: ["GET /orgs/{org}/security-advisories"],
    listRepositoryAdvisories: ["GET /repos/{owner}/{repo}/security-advisories"],
    updateRepositoryAdvisory: [
      "PATCH /repos/{owner}/{repo}/security-advisories/{ghsa_id}"
    ]
  },
  teams: {
    addOrUpdateMembershipForUserInOrg: [
      "PUT /orgs/{org}/teams/{team_slug}/memberships/{username}"
    ],
    addOrUpdateProjectPermissionsInOrg: [
      "PUT /orgs/{org}/teams/{team_slug}/projects/{project_id}"
    ],
    addOrUpdateRepoPermissionsInOrg: [
      "PUT /orgs/{org}/teams/{team_slug}/repos/{owner}/{repo}"
    ],
    checkPermissionsForProjectInOrg: [
      "GET /orgs/{org}/teams/{team_slug}/projects/{project_id}"
    ],
    checkPermissionsForRepoInOrg: [
      "GET /orgs/{org}/teams/{team_slug}/repos/{owner}/{repo}"
    ],
    create: ["POST /orgs/{org}/teams"],
    createDiscussionCommentInOrg: [
      "POST /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments"
    ],
    createDiscussionInOrg: ["POST /orgs/{org}/teams/{team_slug}/discussions"],
    deleteDiscussionCommentInOrg: [
      "DELETE /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments/{comment_number}"
    ],
    deleteDiscussionInOrg: [
      "DELETE /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}"
    ],
    deleteInOrg: ["DELETE /orgs/{org}/teams/{team_slug}"],
    getByName: ["GET /orgs/{org}/teams/{team_slug}"],
    getDiscussionCommentInOrg: [
      "GET /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments/{comment_number}"
    ],
    getDiscussionInOrg: [
      "GET /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}"
    ],
    getMembershipForUserInOrg: [
      "GET /orgs/{org}/teams/{team_slug}/memberships/{username}"
    ],
    list: ["GET /orgs/{org}/teams"],
    listChildInOrg: ["GET /orgs/{org}/teams/{team_slug}/teams"],
    listDiscussionCommentsInOrg: [
      "GET /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments"
    ],
    listDiscussionsInOrg: ["GET /orgs/{org}/teams/{team_slug}/discussions"],
    listForAuthenticatedUser: ["GET /user/teams"],
    listMembersInOrg: ["GET /orgs/{org}/teams/{team_slug}/members"],
    listPendingInvitationsInOrg: [
      "GET /orgs/{org}/teams/{team_slug}/invitations"
    ],
    listProjectsInOrg: ["GET /orgs/{org}/teams/{team_slug}/projects"],
    listReposInOrg: ["GET /orgs/{org}/teams/{team_slug}/repos"],
    removeMembershipForUserInOrg: [
      "DELETE /orgs/{org}/teams/{team_slug}/memberships/{username}"
    ],
    removeProjectInOrg: [
      "DELETE /orgs/{org}/teams/{team_slug}/projects/{project_id}"
    ],
    removeRepoInOrg: [
      "DELETE /orgs/{org}/teams/{team_slug}/repos/{owner}/{repo}"
    ],
    updateDiscussionCommentInOrg: [
      "PATCH /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments/{comment_number}"
    ],
    updateDiscussionInOrg: [
      "PATCH /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}"
    ],
    updateInOrg: ["PATCH /orgs/{org}/teams/{team_slug}"]
  },
  users: {
    addEmailForAuthenticated: [
      "POST /user/emails",
      {},
      { renamed: ["users", "addEmailForAuthenticatedUser"] }
    ],
    addEmailForAuthenticatedUser: ["POST /user/emails"],
    addSocialAccountForAuthenticatedUser: ["POST /user/social_accounts"],
    block: ["PUT /user/blocks/{username}"],
    checkBlocked: ["GET /user/blocks/{username}"],
    checkFollowingForUser: ["GET /users/{username}/following/{target_user}"],
    checkPersonIsFollowedByAuthenticated: ["GET /user/following/{username}"],
    createGpgKeyForAuthenticated: [
      "POST /user/gpg_keys",
      {},
      { renamed: ["users", "createGpgKeyForAuthenticatedUser"] }
    ],
    createGpgKeyForAuthenticatedUser: ["POST /user/gpg_keys"],
    createPublicSshKeyForAuthenticated: [
      "POST /user/keys",
      {},
      { renamed: ["users", "createPublicSshKeyForAuthenticatedUser"] }
    ],
    createPublicSshKeyForAuthenticatedUser: ["POST /user/keys"],
    createSshSigningKeyForAuthenticatedUser: ["POST /user/ssh_signing_keys"],
    deleteEmailForAuthenticated: [
      "DELETE /user/emails",
      {},
      { renamed: ["users", "deleteEmailForAuthenticatedUser"] }
    ],
    deleteEmailForAuthenticatedUser: ["DELETE /user/emails"],
    deleteGpgKeyForAuthenticated: [
      "DELETE /user/gpg_keys/{gpg_key_id}",
      {},
      { renamed: ["users", "deleteGpgKeyForAuthenticatedUser"] }
    ],
    deleteGpgKeyForAuthenticatedUser: ["DELETE /user/gpg_keys/{gpg_key_id}"],
    deletePublicSshKeyForAuthenticated: [
      "DELETE /user/keys/{key_id}",
      {},
      { renamed: ["users", "deletePublicSshKeyForAuthenticatedUser"] }
    ],
    deletePublicSshKeyForAuthenticatedUser: ["DELETE /user/keys/{key_id}"],
    deleteSocialAccountForAuthenticatedUser: ["DELETE /user/social_accounts"],
    deleteSshSigningKeyForAuthenticatedUser: [
      "DELETE /user/ssh_signing_keys/{ssh_signing_key_id}"
    ],
    follow: ["PUT /user/following/{username}"],
    getAuthenticated: ["GET /user"],
    getById: ["GET /user/{account_id}"],
    getByUsername: ["GET /users/{username}"],
    getContextForUser: ["GET /users/{username}/hovercard"],
    getGpgKeyForAuthenticated: [
      "GET /user/gpg_keys/{gpg_key_id}",
      {},
      { renamed: ["users", "getGpgKeyForAuthenticatedUser"] }
    ],
    getGpgKeyForAuthenticatedUser: ["GET /user/gpg_keys/{gpg_key_id}"],
    getPublicSshKeyForAuthenticated: [
      "GET /user/keys/{key_id}",
      {},
      { renamed: ["users", "getPublicSshKeyForAuthenticatedUser"] }
    ],
    getPublicSshKeyForAuthenticatedUser: ["GET /user/keys/{key_id}"],
    getSshSigningKeyForAuthenticatedUser: [
      "GET /user/ssh_signing_keys/{ssh_signing_key_id}"
    ],
    list: ["GET /users"],
    listAttestations: ["GET /users/{username}/attestations/{subject_digest}"],
    listBlockedByAuthenticated: [
      "GET /user/blocks",
      {},
      { renamed: ["users", "listBlockedByAuthenticatedUser"] }
    ],
    listBlockedByAuthenticatedUser: ["GET /user/blocks"],
    listEmailsForAuthenticated: [
      "GET /user/emails",
      {},
      { renamed: ["users", "listEmailsForAuthenticatedUser"] }
    ],
    listEmailsForAuthenticatedUser: ["GET /user/emails"],
    listFollowedByAuthenticated: [
      "GET /user/following",
      {},
      { renamed: ["users", "listFollowedByAuthenticatedUser"] }
    ],
    listFollowedByAuthenticatedUser: ["GET /user/following"],
    listFollowersForAuthenticatedUser: ["GET /user/followers"],
    listFollowersForUser: ["GET /users/{username}/followers"],
    listFollowingForUser: ["GET /users/{username}/following"],
    listGpgKeysForAuthenticated: [
      "GET /user/gpg_keys",
      {},
      { renamed: ["users", "listGpgKeysForAuthenticatedUser"] }
    ],
    listGpgKeysForAuthenticatedUser: ["GET /user/gpg_keys"],
    listGpgKeysForUser: ["GET /users/{username}/gpg_keys"],
    listPublicEmailsForAuthenticated: [
      "GET /user/public_emails",
      {},
      { renamed: ["users", "listPublicEmailsForAuthenticatedUser"] }
    ],
    listPublicEmailsForAuthenticatedUser: ["GET /user/public_emails"],
    listPublicKeysForUser: ["GET /users/{username}/keys"],
    listPublicSshKeysForAuthenticated: [
      "GET /user/keys",
      {},
      { renamed: ["users", "listPublicSshKeysForAuthenticatedUser"] }
    ],
    listPublicSshKeysForAuthenticatedUser: ["GET /user/keys"],
    listSocialAccountsForAuthenticatedUser: ["GET /user/social_accounts"],
    listSocialAccountsForUser: ["GET /users/{username}/social_accounts"],
    listSshSigningKeysForAuthenticatedUser: ["GET /user/ssh_signing_keys"],
    listSshSigningKeysForUser: ["GET /users/{username}/ssh_signing_keys"],
    setPrimaryEmailVisibilityForAuthenticated: [
      "PATCH /user/email/visibility",
      {},
      { renamed: ["users", "setPrimaryEmailVisibilityForAuthenticatedUser"] }
    ],
    setPrimaryEmailVisibilityForAuthenticatedUser: [
      "PATCH /user/email/visibility"
    ],
    unblock: ["DELETE /user/blocks/{username}"],
    unfollow: ["DELETE /user/following/{username}"],
    updateAuthenticated: ["PATCH /user"]
  }
};
var endpoints_default = Endpoints;

// node_modules/@octokit/plugin-rest-endpoint-methods/dist-src/endpoints-to-methods.js
var endpointMethodsMap = /* @__PURE__ */ new Map();
for (const [scope, endpoints] of Object.entries(endpoints_default)) {
  for (const [methodName, endpoint2] of Object.entries(endpoints)) {
    const [route, defaults, decorations] = endpoint2;
    const [method, url] = route.split(/ /);
    const endpointDefaults = Object.assign(
      {
        method,
        url
      },
      defaults
    );
    if (!endpointMethodsMap.has(scope)) {
      endpointMethodsMap.set(scope, /* @__PURE__ */ new Map());
    }
    endpointMethodsMap.get(scope).set(methodName, {
      scope,
      methodName,
      endpointDefaults,
      decorations
    });
  }
}
var handler = {
  has({ scope }, methodName) {
    return endpointMethodsMap.get(scope).has(methodName);
  },
  getOwnPropertyDescriptor(target, methodName) {
    return {
      value: this.get(target, methodName),
      // ensures method is in the cache
      configurable: true,
      writable: true,
      enumerable: true
    };
  },
  defineProperty(target, methodName, descriptor) {
    Object.defineProperty(target.cache, methodName, descriptor);
    return true;
  },
  deleteProperty(target, methodName) {
    delete target.cache[methodName];
    return true;
  },
  ownKeys({ scope }) {
    return [...endpointMethodsMap.get(scope).keys()];
  },
  set(target, methodName, value) {
    return target.cache[methodName] = value;
  },
  get({ octokit, scope, cache }, methodName) {
    if (cache[methodName]) {
      return cache[methodName];
    }
    const method = endpointMethodsMap.get(scope).get(methodName);
    if (!method) {
      return void 0;
    }
    const { endpointDefaults, decorations } = method;
    if (decorations) {
      cache[methodName] = decorate(
        octokit,
        scope,
        methodName,
        endpointDefaults,
        decorations
      );
    } else {
      cache[methodName] = octokit.request.defaults(endpointDefaults);
    }
    return cache[methodName];
  }
};
function endpointsToMethods(octokit) {
  const newMethods = {};
  for (const scope of endpointMethodsMap.keys()) {
    newMethods[scope] = new Proxy({ octokit, scope, cache: {} }, handler);
  }
  return newMethods;
}
function decorate(octokit, scope, methodName, defaults, decorations) {
  const requestWithDefaults = octokit.request.defaults(defaults);
  function withDecorations(...args) {
    let options = requestWithDefaults.endpoint.merge(...args);
    if (decorations.mapToData) {
      options = Object.assign({}, options, {
        data: options[decorations.mapToData],
        [decorations.mapToData]: void 0
      });
      return requestWithDefaults(options);
    }
    if (decorations.renamed) {
      const [newScope, newMethodName] = decorations.renamed;
      octokit.log.warn(
        `octokit.${scope}.${methodName}() has been renamed to octokit.${newScope}.${newMethodName}()`
      );
    }
    if (decorations.deprecated) {
      octokit.log.warn(decorations.deprecated);
    }
    if (decorations.renamedParameters) {
      const options2 = requestWithDefaults.endpoint.merge(...args);
      for (const [name, alias] of Object.entries(
        decorations.renamedParameters
      )) {
        if (name in options2) {
          octokit.log.warn(
            `"${name}" parameter is deprecated for "octokit.${scope}.${methodName}()". Use "${alias}" instead`
          );
          if (!(alias in options2)) {
            options2[alias] = options2[name];
          }
          delete options2[name];
        }
      }
      return requestWithDefaults(options2);
    }
    return requestWithDefaults(...args);
  }
  return Object.assign(withDecorations, requestWithDefaults);
}
function legacyRestEndpointMethods(octokit) {
  const api = endpointsToMethods(octokit);
  return {
    ...api,
    rest: api
  };
}
legacyRestEndpointMethods.VERSION = VERSION7;

// node_modules/@octokit/rest/dist-web/index.js
var VERSION8 = "20.1.2";
var Octokit2 = Octokit.plugin(
  requestLog,
  legacyRestEndpointMethods,
  paginateRest
).defaults({
  userAgent: `octokit-rest.js/${VERSION8}`
});

// src/config/load.ts
var import_dotenv = __toESM(require_main(), 1);

// node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});

// node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};

// node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};
var ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

// node_modules/zod/v3/locales/en.js
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
var en_default = errorMap;

// node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}

// node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = (params) => {
  const { data, path: path2, errorMaps, issueData } = params;
  const fullPath = [...path2, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var ParseStatus = class _ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;

// node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// node_modules/zod/v3/types.js
var ParseInputLazyPath = class {
  constructor(parent, value, path2, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path2;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
var ZodType = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
var ZodString = class _ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
var ZodNumber = class _ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class _ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class _ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class _ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
var ZodObject = class _ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") ; else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
};
var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
var ZodIntersection = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class _ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
var ZodMap = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class _ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class _ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
var ZodLazy = class extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
var ZodEnum = class _ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline = class _ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
var ZodReadonly = class extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: ((arg) => ZodString.create({ ...arg, coerce: true })),
  number: ((arg) => ZodNumber.create({ ...arg, coerce: true })),
  boolean: ((arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  })),
  bigint: ((arg) => ZodBigInt.create({ ...arg, coerce: true })),
  date: ((arg) => ZodDate.create({ ...arg, coerce: true }))
};
var NEVER = INVALID;

// src/config/schema.ts
external_exports.object({
  include: external_exports.array(external_exports.string()).default([]),
  exclude: external_exports.array(external_exports.string()).default([]),
  explicit_urls: external_exports.array(external_exports.string()).default([]),
  categories: external_exports.record(external_exports.string()).default({}),
  official_owners: external_exports.array(external_exports.string()).default([]),
  data_branch: external_exports.string().default("__STORAGE__"),
  max_shards: external_exports.number().int().positive().default(8)
});

// src/config/load.ts
import_dotenv.default.config();
function env(name, required = false) {
  const val = process.env[name];
  if (required && !val) throw new Error(`Missing required env: ${name}`);
  return val;
}

// src/github/client.ts
function getOctokit() {
  const token = env("GITHUB_TOKEN", true);
  return new Octokit2({ auth: token, request: { retries: 0 } });
}

// node_modules/yocto-queue/index.js
var Node = class {
  value;
  next;
  constructor(value) {
    this.value = value;
  }
};
var Queue = class {
  #head;
  #tail;
  #size;
  constructor() {
    this.clear();
  }
  enqueue(value) {
    const node = new Node(value);
    if (this.#head) {
      this.#tail.next = node;
      this.#tail = node;
    } else {
      this.#head = node;
      this.#tail = node;
    }
    this.#size++;
  }
  dequeue() {
    const current = this.#head;
    if (!current) {
      return;
    }
    this.#head = this.#head.next;
    this.#size--;
    return current.value;
  }
  peek() {
    if (!this.#head) {
      return;
    }
    return this.#head.value;
  }
  clear() {
    this.#head = void 0;
    this.#tail = void 0;
    this.#size = 0;
  }
  get size() {
    return this.#size;
  }
  *[Symbol.iterator]() {
    let current = this.#head;
    while (current) {
      yield current.value;
      current = current.next;
    }
  }
  *drain() {
    while (this.#head) {
      yield this.dequeue();
    }
  }
};
function pLimit(concurrency) {
  if (!((Number.isInteger(concurrency) || concurrency === Number.POSITIVE_INFINITY) && concurrency > 0)) {
    throw new TypeError("Expected `concurrency` to be a number from 1 and up");
  }
  const queue = new Queue();
  let activeCount = 0;
  const next = () => {
    activeCount--;
    if (queue.size > 0) {
      queue.dequeue()();
    }
  };
  const run = async (function_, resolve, arguments_) => {
    activeCount++;
    const result = (async () => function_(...arguments_))();
    resolve(result);
    try {
      await result;
    } catch {
    }
    next();
  };
  const enqueue = (function_, resolve, arguments_) => {
    queue.enqueue(
      AsyncResource.bind(run.bind(void 0, function_, resolve, arguments_))
    );
    (async () => {
      await Promise.resolve();
      if (activeCount < concurrency && queue.size > 0) {
        queue.dequeue()();
      }
    })();
  };
  const generator = (function_, ...arguments_) => new Promise((resolve) => {
    enqueue(function_, resolve, arguments_);
  });
  Object.defineProperties(generator, {
    activeCount: {
      get: () => activeCount
    },
    pendingCount: {
      get: () => queue.size
    },
    clearQueue: {
      value() {
        queue.clear();
      }
    }
  });
  return generator;
}

// src/fetch.ts
var limit = pLimit(6);
async function fetchIssuesForRepo(octokit, full) {
  const [owner, repo] = full.split("/");
  const raw = await octokit.paginate(octokit.issues.listForRepo, {
    owner,
    repo,
    state: "all",
    per_page: 100
  });
  const issues = [];
  for (const i of raw) {
    if (i.pull_request) continue;
    if (i.state === "closed" && i.state_reason === "not_planned") continue;
    issues.push({
      owner,
      repo,
      number: i.number,
      node_id: i.node_id,
      title: i.title ?? "",
      url: i.html_url ?? "",
      body: i.body ?? "",
      labels: (i.labels ?? []).map((l) => typeof l === "string" ? l : l.name).filter(Boolean),
      assignees: (i.assignees ?? []).map((a) => a.login).filter(Boolean),
      state: i.state === "open" ? "open" : "closed",
      created_at: i.created_at ?? (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: i.updated_at ?? (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  return issues;
}
async function fetchPRsForRepo(octokit, full) {
  const [owner, repo] = full.split("/");
  const raw = await octokit.paginate(octokit.pulls.list, { owner, repo, state: "all", per_page: 100 });
  return raw.map((pr) => ({
    owner,
    repo,
    number: pr.number,
    state: pr.state === "open" ? "open" : "closed",
    url: pr.html_url ?? "",
    title: pr.title ?? "",
    created_at: pr.created_at ?? (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: pr.updated_at ?? (/* @__PURE__ */ new Date()).toISOString()
  }));
}
async function fetchOwnersAvatars(octokit, owners) {
  const out = [];
  const tasks = Array.from(owners).map(
    (o) => limit(async () => {
      try {
        const { data } = await octokit.users.getByUsername({ username: o });
        out.push({ owner: o, type: "User", avatar_url: data.avatar_url ?? "" });
      } catch {
        try {
          const { data } = await octokit.orgs.get({ org: o });
          out.push({ owner: o, type: "Organization", avatar_url: data.avatar_url ?? "" });
        } catch {
        }
      }
    })
  );
  await Promise.all(tasks);
  return out;
}

// src/artifacts/state.ts
function computeMirrorStateEntry(issue, directory, category) {
  const price = issue.labels.find((l) => l.startsWith("Price:")) ?? null;
  const time = issue.labels.find((l) => l.startsWith("Time:")) ?? null;
  return {
    directory_issue_number: directory?.number,
    directory_issue_url: directory?.url,
    assigned: issue.assignees.length > 0,
    assignees: issue.assignees,
    price_label: price,
    time_label: time,
    category
  };
}

// src/mirror/reconcile.ts
async function reconcileMirror(octokit, directory, partnerIssue, index, opts) {
  const dry = Boolean(opts?.dryRun);
  const enforced = process.env.WRITE_TARGET_REPO;
  const target = `${directory.owner}/${directory.repo}`;
  if (enforced && enforced !== target) {
    throw new Error(`write-blocked: target ${target} != enforced ${enforced}`);
  }
  const existing = index[partnerIssue.node_id];
  const common = {
    owner: directory.owner,
    repo: directory.repo,
    title: partnerIssue.title,
    body: partnerIssue.html_url,
    labels: partnerIssue.labels
  };
  if (!existing) {
    try {
      const url = partnerIssue.html_url;
      const urlWww = url.replace("https://github.com/", "https://www.github.com/");
      const q = `repo:${directory.owner}/${directory.repo} in:body is:issue ${JSON.stringify(url)}`;
      const res = await octokit.rest.search.issuesAndPullRequests({ q, per_page: 20 });
      const candidates = (res.data.items || []).filter(
        (it) => typeof it.body === "string" && (it.body.trim() === url || it.body.trim() === urlWww)
      );
      if (candidates.length) {
        candidates.sort((a, b) => a.number - b.number);
        const pick = candidates[0];
        return { number: pick.number, url: pick.html_url };
      }
    } catch {
    }
    if (dry) return { number: -1, url: "" };
    const { data } = await octokit.rest.issues.create({ ...common });
    return { number: data.number, url: data.html_url ?? "" };
  }
  if (!dry) {
    await octokit.rest.issues.update({ ...common, issue_number: existing.number, state: partnerIssue.state });
  }
  return existing;
}

// src/mirror/sync.ts
async function syncShard(octokit, opts) {
  const issues = [];
  const mirrorState = {};
  const prs = [];
  const ownersSet = /* @__PURE__ */ new Set();
  const twitterDelta = {};
  const syncMeta = {};
  const index = opts.index ?? {};
  const dryRun = process.env.DRY_RUN === "true";
  const poolSize = Math.max(1, Number(process.env.SHARD_CONCURRENCY ?? "4"));
  const pool = pLimit(poolSize);
  const tasks = opts.repos.map(
    (full) => pool(async () => {
      const [owner] = full.split("/");
      ownersSet.add(owner);
      let iss = [];
      try {
        iss = await fetchIssuesForRepo(octokit, full);
      } catch (e) {
        console.warn(`[sync] fetchIssues failed for ${full}: ${e?.status ?? e?.message ?? e}`);
        iss = [];
      }
      issues.push(...iss);
      for (const it of iss) {
        if (it.body && /^https?:\/\/(www\.)?github\.com\/[^\s]+\/issues\/\d+$/.test(it.body.trim())) {
          continue;
        }
        const hasPrice = it.labels.some((l) => /^Price:\s*/.test(l));
        const isOpen = it.state === "open";
        let dir = null;
        if (isOpen && hasPrice) {
          try {
            const res = await reconcileMirror(
              octokit,
              { owner: opts.directoryOwner, repo: opts.directoryRepo },
              { node_id: it.node_id, title: it.title, html_url: it.url, state: it.state, labels: it.labels },
              index,
              { dryRun }
            );
            dir = res;
            index[it.node_id] = { number: res.number, url: res.url };
          } catch (e) {
            console.warn(`[sync] mirror create/update failed for ${it.owner}/${it.repo}#${it.number}: ${e instanceof Error ? e.message : e}`);
          }
        } else if (!isOpen && index[it.node_id]) {
          try {
            const res = await reconcileMirror(
              octokit,
              { owner: opts.directoryOwner, repo: opts.directoryRepo },
              { node_id: it.node_id, title: it.title, html_url: it.url, state: it.state, labels: it.labels },
              index,
              { dryRun }
            );
            dir = res;
          } catch (e) {
            console.warn(`[sync] mirror close failed for ${it.owner}/${it.repo}#${it.number}: ${e instanceof Error ? e.message : e}`);
          }
        }
        mirrorState[it.node_id] = computeMirrorStateEntry(it, dir, void 0);
      }
      try {
        const rawPrs = await fetchPRsForRepo(octokit, full);
        prs.push(...rawPrs);
      } catch (e) {
        console.warn(`[sync] fetchPRs failed for ${full}: ${e?.status ?? e?.message ?? e}`);
      }
      syncMeta[full] = { lastSyncISO: (/* @__PURE__ */ new Date()).toISOString() };
    })
  );
  await Promise.all(tasks);
  const owners = await fetchOwnersAvatars(octokit, ownersSet);
  return { issues, mirrorState, prs, owners, twitterDelta, syncMeta };
}
function writeJson(outDir, file, data) {
  fs4__default.mkdirSync(outDir, { recursive: true });
  const p = path.join(outDir, file);
  fs4__default.writeFileSync(p, JSON.stringify(data, null, 2));
}

// node_modules/twitter-api-v2/dist/esm/globals.js
var API_V2_PREFIX = "https://api.x.com/2/";
var API_V2_LABS_PREFIX = "https://api.x.com/labs/2/";
var API_V1_1_PREFIX = "https://api.x.com/1.1/";
var API_V1_1_UPLOAD_PREFIX = "https://upload.x.com/1.1/";
var API_V1_1_STREAM_PREFIX = "https://stream.x.com/1.1/";
var API_ADS_PREFIX = "https://ads-api.x.com/12/";
var API_ADS_SANDBOX_PREFIX = "https://ads-api-sandbox.twitter.com/12/";

// node_modules/twitter-api-v2/dist/esm/paginators/TwitterPaginator.js
var TwitterPaginator = class {
  // noinspection TypeScriptAbstractClassConstructorCanBeMadeProtected
  constructor({ realData, rateLimit, instance, queryParams, sharedParams }) {
    this._maxResultsWhenFetchLast = 100;
    this._realData = realData;
    this._rateLimit = rateLimit;
    this._instance = instance;
    this._queryParams = queryParams;
    this._sharedParams = sharedParams;
  }
  get _isRateLimitOk() {
    if (!this._rateLimit) {
      return true;
    }
    const resetDate = this._rateLimit.reset * 1e3;
    if (resetDate < Date.now()) {
      return true;
    }
    return this._rateLimit.remaining > 0;
  }
  makeRequest(queryParams) {
    return this._instance.get(this.getEndpoint(), queryParams, { fullResponse: true, params: this._sharedParams });
  }
  makeNewInstanceFromResult(result, queryParams) {
    return new this.constructor({
      realData: result.data,
      rateLimit: result.rateLimit,
      instance: this._instance,
      queryParams,
      sharedParams: this._sharedParams
    });
  }
  getEndpoint() {
    return this._endpoint;
  }
  injectQueryParams(maxResults) {
    return {
      ...maxResults ? { max_results: maxResults } : {},
      ...this._queryParams
    };
  }
  /* ---------------------- */
  /* Real paginator methods */
  /* ---------------------- */
  /**
   * Next page.
   */
  async next(maxResults) {
    const queryParams = this.getNextQueryParams(maxResults);
    const result = await this.makeRequest(queryParams);
    return this.makeNewInstanceFromResult(result, queryParams);
  }
  /**
   * Next page, but store it in current instance.
   */
  async fetchNext(maxResults) {
    const queryParams = this.getNextQueryParams(maxResults);
    const result = await this.makeRequest(queryParams);
    await this.refreshInstanceFromResult(result, true);
    return this;
  }
  /**
   * Fetch up to {count} items after current page,
   * as long as rate limit is not hit and Twitter has some results
   */
  async fetchLast(count = Infinity) {
    let queryParams = this.getNextQueryParams(this._maxResultsWhenFetchLast);
    let resultCount = 0;
    while (resultCount < count && this._isRateLimitOk) {
      const response = await this.makeRequest(queryParams);
      await this.refreshInstanceFromResult(response, true);
      resultCount += this.getPageLengthFromRequest(response);
      if (this.isFetchLastOver(response)) {
        break;
      }
      queryParams = this.getNextQueryParams(this._maxResultsWhenFetchLast);
    }
    return this;
  }
  get rateLimit() {
    var _a;
    return { ...(_a = this._rateLimit) !== null && _a !== void 0 ? _a : {} };
  }
  /** Get raw data returned by Twitter API. */
  get data() {
    return this._realData;
  }
  get done() {
    return !this.canFetchNextPage(this._realData);
  }
  /**
   * Iterate over currently fetched items.
   */
  *[Symbol.iterator]() {
    yield* this.getItemArray();
  }
  /**
   * Iterate over items "indefinitely" (until rate limit is hit / they're no more items available)
   * This will **mutate the current instance** and fill data, metas, etc. inside this instance.
   *
   * If you need to handle concurrent requests, or you need to rely on immutability, please use `.fetchAndIterate()` instead.
   */
  async *[Symbol.asyncIterator]() {
    yield* this.getItemArray();
    let paginator = this;
    let canFetchNextPage = this.canFetchNextPage(this._realData);
    while (canFetchNextPage && this._isRateLimitOk && paginator.getItemArray().length > 0) {
      const next = await paginator.next(this._maxResultsWhenFetchLast);
      this.refreshInstanceFromResult({ data: next._realData, headers: {}, rateLimit: next._rateLimit }, true);
      canFetchNextPage = this.canFetchNextPage(next._realData);
      const items = next.getItemArray();
      yield* items;
      paginator = next;
    }
  }
  /**
   * Iterate over items "indefinitely" without modifying the current instance (until rate limit is hit / they're no more items available)
   *
   * This will **NOT** mutate the current instance, meaning that current instance will not inherit from `includes` and `meta` (v2 API only).
   * Use `Symbol.asyncIterator` (`for-await of`) to directly access items with current instance mutation.
   */
  async *fetchAndIterate() {
    for (const item of this.getItemArray()) {
      yield [item, this];
    }
    let paginator = this;
    let canFetchNextPage = this.canFetchNextPage(this._realData);
    while (canFetchNextPage && this._isRateLimitOk && paginator.getItemArray().length > 0) {
      const next = await paginator.next(this._maxResultsWhenFetchLast);
      this.refreshInstanceFromResult({ data: next._realData, headers: {}, rateLimit: next._rateLimit }, true);
      canFetchNextPage = this.canFetchNextPage(next._realData);
      for (const item of next.getItemArray()) {
        yield [item, next];
      }
      this._rateLimit = next._rateLimit;
      paginator = next;
    }
  }
};
var PreviousableTwitterPaginator = class extends TwitterPaginator {
  /**
   * Previous page (new tweets)
   */
  async previous(maxResults) {
    const queryParams = this.getPreviousQueryParams(maxResults);
    const result = await this.makeRequest(queryParams);
    return this.makeNewInstanceFromResult(result, queryParams);
  }
  /**
   * Previous page, but in current instance.
   */
  async fetchPrevious(maxResults) {
    const queryParams = this.getPreviousQueryParams(maxResults);
    const result = await this.makeRequest(queryParams);
    await this.refreshInstanceFromResult(result, false);
    return this;
  }
};
var TwitterPaginator_default = TwitterPaginator;

// node_modules/twitter-api-v2/dist/esm/paginators/paginator.v1.js
var CursoredV1Paginator = class extends TwitterPaginator_default {
  getNextQueryParams(maxResults) {
    var _a;
    return {
      ...this._queryParams,
      cursor: (_a = this._realData.next_cursor_str) !== null && _a !== void 0 ? _a : this._realData.next_cursor,
      ...maxResults ? { count: maxResults } : {}
    };
  }
  isFetchLastOver(result) {
    return !this.canFetchNextPage(result.data);
  }
  canFetchNextPage(result) {
    return !this.isNextCursorInvalid(result.next_cursor) || !this.isNextCursorInvalid(result.next_cursor_str);
  }
  isNextCursorInvalid(value) {
    return value === void 0 || value === 0 || value === -1 || value === "0" || value === "-1";
  }
};

// node_modules/twitter-api-v2/dist/esm/paginators/dm.paginator.v1.js
var DmEventsV1Paginator = class extends CursoredV1Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "direct_messages/events/list.json";
  }
  refreshInstanceFromResult(response, isNextPage) {
    const result = response.data;
    this._rateLimit = response.rateLimit;
    if (isNextPage) {
      this._realData.events.push(...result.events);
      this._realData.next_cursor = result.next_cursor;
    }
  }
  getPageLengthFromRequest(result) {
    return result.data.events.length;
  }
  getItemArray() {
    return this.events;
  }
  /**
   * Events returned by paginator.
   */
  get events() {
    return this._realData.events;
  }
};
var WelcomeDmV1Paginator = class extends CursoredV1Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "direct_messages/welcome_messages/list.json";
  }
  refreshInstanceFromResult(response, isNextPage) {
    const result = response.data;
    this._rateLimit = response.rateLimit;
    if (isNextPage) {
      this._realData.welcome_messages.push(...result.welcome_messages);
      this._realData.next_cursor = result.next_cursor;
    }
  }
  getPageLengthFromRequest(result) {
    return result.data.welcome_messages.length;
  }
  getItemArray() {
    return this.welcomeMessages;
  }
  get welcomeMessages() {
    return this._realData.welcome_messages;
  }
};

// node_modules/twitter-api-v2/dist/esm/types/v1/tweet.v1.types.js
var EUploadMimeType;
(function(EUploadMimeType2) {
  EUploadMimeType2["Jpeg"] = "image/jpeg";
  EUploadMimeType2["Mp4"] = "video/mp4";
  EUploadMimeType2["Mov"] = "video/quicktime";
  EUploadMimeType2["Gif"] = "image/gif";
  EUploadMimeType2["Png"] = "image/png";
  EUploadMimeType2["Srt"] = "text/plain";
  EUploadMimeType2["Webp"] = "image/webp";
})(EUploadMimeType || (EUploadMimeType = {}));

// node_modules/twitter-api-v2/dist/esm/types/v1/dm.v1.types.js
var EDirectMessageEventTypeV1;
(function(EDirectMessageEventTypeV12) {
  EDirectMessageEventTypeV12["Create"] = "message_create";
  EDirectMessageEventTypeV12["WelcomeCreate"] = "welcome_message";
})(EDirectMessageEventTypeV1 || (EDirectMessageEventTypeV1 = {}));

// node_modules/twitter-api-v2/dist/esm/types/errors.types.js
var ETwitterApiError;
(function(ETwitterApiError2) {
  ETwitterApiError2["Request"] = "request";
  ETwitterApiError2["PartialResponse"] = "partial-response";
  ETwitterApiError2["Response"] = "response";
})(ETwitterApiError || (ETwitterApiError = {}));
var ApiError = class extends Error {
  constructor() {
    super(...arguments);
    this.error = true;
  }
};
var ApiRequestError = class extends ApiError {
  constructor(message, options) {
    super(message);
    this.type = ETwitterApiError.Request;
    Error.captureStackTrace(this, this.constructor);
    Object.defineProperty(this, "_options", { value: options });
  }
  get request() {
    return this._options.request;
  }
  get requestError() {
    return this._options.requestError;
  }
  toJSON() {
    return {
      type: this.type,
      error: this.requestError
    };
  }
};
var ApiPartialResponseError = class extends ApiError {
  constructor(message, options) {
    super(message);
    this.type = ETwitterApiError.PartialResponse;
    Error.captureStackTrace(this, this.constructor);
    Object.defineProperty(this, "_options", { value: options });
  }
  get request() {
    return this._options.request;
  }
  get response() {
    return this._options.response;
  }
  get responseError() {
    return this._options.responseError;
  }
  get rawContent() {
    return this._options.rawContent;
  }
  toJSON() {
    return {
      type: this.type,
      error: this.responseError
    };
  }
};
var ApiResponseError = class extends ApiError {
  constructor(message, options) {
    super(message);
    this.type = ETwitterApiError.Response;
    Error.captureStackTrace(this, this.constructor);
    Object.defineProperty(this, "_options", { value: options });
    this.code = options.code;
    this.headers = options.headers;
    this.rateLimit = options.rateLimit;
    if (options.data && typeof options.data === "object" && "error" in options.data && !options.data.errors) {
      const data = { ...options.data };
      data.errors = [{
        code: EApiV1ErrorCode.InternalError,
        message: data.error
      }];
      this.data = data;
    } else {
      this.data = options.data;
    }
  }
  get request() {
    return this._options.request;
  }
  get response() {
    return this._options.response;
  }
  /** Check for presence of one of given v1/v2 error codes. */
  hasErrorCode(...codes) {
    const errors = this.errors;
    if (!(errors === null || errors === void 0 ? void 0 : errors.length)) {
      return false;
    }
    if ("code" in errors[0]) {
      const v1errors = errors;
      return v1errors.some((error) => codes.includes(error.code));
    }
    const v2error = this.data;
    return codes.includes(v2error.type);
  }
  get errors() {
    var _a;
    return (_a = this.data) === null || _a === void 0 ? void 0 : _a.errors;
  }
  get rateLimitError() {
    return this.code === 420 || this.code === 429;
  }
  get isAuthError() {
    if (this.code === 401) {
      return true;
    }
    return this.hasErrorCode(EApiV1ErrorCode.AuthTimestampInvalid, EApiV1ErrorCode.AuthenticationFail, EApiV1ErrorCode.BadAuthenticationData, EApiV1ErrorCode.InvalidOrExpiredToken);
  }
  toJSON() {
    return {
      type: this.type,
      code: this.code,
      error: this.data,
      rateLimit: this.rateLimit,
      headers: this.headers
    };
  }
};
var EApiV1ErrorCode;
(function(EApiV1ErrorCode2) {
  EApiV1ErrorCode2[EApiV1ErrorCode2["InvalidCoordinates"] = 3] = "InvalidCoordinates";
  EApiV1ErrorCode2[EApiV1ErrorCode2["NoLocationFound"] = 13] = "NoLocationFound";
  EApiV1ErrorCode2[EApiV1ErrorCode2["AuthenticationFail"] = 32] = "AuthenticationFail";
  EApiV1ErrorCode2[EApiV1ErrorCode2["InvalidOrExpiredToken"] = 89] = "InvalidOrExpiredToken";
  EApiV1ErrorCode2[EApiV1ErrorCode2["UnableToVerifyCredentials"] = 99] = "UnableToVerifyCredentials";
  EApiV1ErrorCode2[EApiV1ErrorCode2["AuthTimestampInvalid"] = 135] = "AuthTimestampInvalid";
  EApiV1ErrorCode2[EApiV1ErrorCode2["BadAuthenticationData"] = 215] = "BadAuthenticationData";
  EApiV1ErrorCode2[EApiV1ErrorCode2["NoUserMatch"] = 17] = "NoUserMatch";
  EApiV1ErrorCode2[EApiV1ErrorCode2["UserNotFound"] = 50] = "UserNotFound";
  EApiV1ErrorCode2[EApiV1ErrorCode2["ResourceNotFound"] = 34] = "ResourceNotFound";
  EApiV1ErrorCode2[EApiV1ErrorCode2["TweetNotFound"] = 144] = "TweetNotFound";
  EApiV1ErrorCode2[EApiV1ErrorCode2["TweetNotVisible"] = 179] = "TweetNotVisible";
  EApiV1ErrorCode2[EApiV1ErrorCode2["NotAllowedResource"] = 220] = "NotAllowedResource";
  EApiV1ErrorCode2[EApiV1ErrorCode2["MediaIdNotFound"] = 325] = "MediaIdNotFound";
  EApiV1ErrorCode2[EApiV1ErrorCode2["TweetNoLongerAvailable"] = 421] = "TweetNoLongerAvailable";
  EApiV1ErrorCode2[EApiV1ErrorCode2["TweetViolatedRules"] = 422] = "TweetViolatedRules";
  EApiV1ErrorCode2[EApiV1ErrorCode2["TargetUserSuspended"] = 63] = "TargetUserSuspended";
  EApiV1ErrorCode2[EApiV1ErrorCode2["YouAreSuspended"] = 64] = "YouAreSuspended";
  EApiV1ErrorCode2[EApiV1ErrorCode2["AccountUpdateFailed"] = 120] = "AccountUpdateFailed";
  EApiV1ErrorCode2[EApiV1ErrorCode2["NoSelfSpamReport"] = 36] = "NoSelfSpamReport";
  EApiV1ErrorCode2[EApiV1ErrorCode2["NoSelfMute"] = 271] = "NoSelfMute";
  EApiV1ErrorCode2[EApiV1ErrorCode2["AccountLocked"] = 326] = "AccountLocked";
  EApiV1ErrorCode2[EApiV1ErrorCode2["RateLimitExceeded"] = 88] = "RateLimitExceeded";
  EApiV1ErrorCode2[EApiV1ErrorCode2["NoDMRightForApp"] = 93] = "NoDMRightForApp";
  EApiV1ErrorCode2[EApiV1ErrorCode2["OverCapacity"] = 130] = "OverCapacity";
  EApiV1ErrorCode2[EApiV1ErrorCode2["InternalError"] = 131] = "InternalError";
  EApiV1ErrorCode2[EApiV1ErrorCode2["TooManyFollowings"] = 161] = "TooManyFollowings";
  EApiV1ErrorCode2[EApiV1ErrorCode2["TweetLimitExceeded"] = 185] = "TweetLimitExceeded";
  EApiV1ErrorCode2[EApiV1ErrorCode2["DuplicatedTweet"] = 187] = "DuplicatedTweet";
  EApiV1ErrorCode2[EApiV1ErrorCode2["TooManySpamReports"] = 205] = "TooManySpamReports";
  EApiV1ErrorCode2[EApiV1ErrorCode2["RequestLooksLikeSpam"] = 226] = "RequestLooksLikeSpam";
  EApiV1ErrorCode2[EApiV1ErrorCode2["NoWriteRightForApp"] = 261] = "NoWriteRightForApp";
  EApiV1ErrorCode2[EApiV1ErrorCode2["TweetActionsDisabled"] = 425] = "TweetActionsDisabled";
  EApiV1ErrorCode2[EApiV1ErrorCode2["TweetRepliesRestricted"] = 433] = "TweetRepliesRestricted";
  EApiV1ErrorCode2[EApiV1ErrorCode2["NamedParameterMissing"] = 38] = "NamedParameterMissing";
  EApiV1ErrorCode2[EApiV1ErrorCode2["InvalidAttachmentUrl"] = 44] = "InvalidAttachmentUrl";
  EApiV1ErrorCode2[EApiV1ErrorCode2["TweetTextTooLong"] = 186] = "TweetTextTooLong";
  EApiV1ErrorCode2[EApiV1ErrorCode2["MissingUrlParameter"] = 195] = "MissingUrlParameter";
  EApiV1ErrorCode2[EApiV1ErrorCode2["NoMultipleGifs"] = 323] = "NoMultipleGifs";
  EApiV1ErrorCode2[EApiV1ErrorCode2["InvalidMediaIds"] = 324] = "InvalidMediaIds";
  EApiV1ErrorCode2[EApiV1ErrorCode2["InvalidUrl"] = 407] = "InvalidUrl";
  EApiV1ErrorCode2[EApiV1ErrorCode2["TooManyTweetAttachments"] = 386] = "TooManyTweetAttachments";
  EApiV1ErrorCode2[EApiV1ErrorCode2["StatusAlreadyFavorited"] = 139] = "StatusAlreadyFavorited";
  EApiV1ErrorCode2[EApiV1ErrorCode2["FollowRequestAlreadySent"] = 160] = "FollowRequestAlreadySent";
  EApiV1ErrorCode2[EApiV1ErrorCode2["CannotUnmuteANonMutedAccount"] = 272] = "CannotUnmuteANonMutedAccount";
  EApiV1ErrorCode2[EApiV1ErrorCode2["TweetAlreadyRetweeted"] = 327] = "TweetAlreadyRetweeted";
  EApiV1ErrorCode2[EApiV1ErrorCode2["ReplyToDeletedTweet"] = 385] = "ReplyToDeletedTweet";
  EApiV1ErrorCode2[EApiV1ErrorCode2["DMReceiverNotFollowingYou"] = 150] = "DMReceiverNotFollowingYou";
  EApiV1ErrorCode2[EApiV1ErrorCode2["UnableToSendDM"] = 151] = "UnableToSendDM";
  EApiV1ErrorCode2[EApiV1ErrorCode2["MustAllowDMFromAnyone"] = 214] = "MustAllowDMFromAnyone";
  EApiV1ErrorCode2[EApiV1ErrorCode2["CannotSendDMToThisUser"] = 349] = "CannotSendDMToThisUser";
  EApiV1ErrorCode2[EApiV1ErrorCode2["DMTextTooLong"] = 354] = "DMTextTooLong";
  EApiV1ErrorCode2[EApiV1ErrorCode2["SubscriptionAlreadyExists"] = 355] = "SubscriptionAlreadyExists";
  EApiV1ErrorCode2[EApiV1ErrorCode2["CallbackUrlNotApproved"] = 415] = "CallbackUrlNotApproved";
  EApiV1ErrorCode2[EApiV1ErrorCode2["SuspendedApplication"] = 416] = "SuspendedApplication";
  EApiV1ErrorCode2[EApiV1ErrorCode2["OobOauthIsNotAllowed"] = 417] = "OobOauthIsNotAllowed";
})(EApiV1ErrorCode || (EApiV1ErrorCode = {}));
var EApiV2ErrorCode;
(function(EApiV2ErrorCode2) {
  EApiV2ErrorCode2["InvalidRequest"] = "https://developer.x.com/en/support/x-api/error-troubleshooting#invalid-request";
  EApiV2ErrorCode2["ClientForbidden"] = "https://developer.x.com/en/support/x-api/error-troubleshooting#client-forbidden";
  EApiV2ErrorCode2["UnsupportedAuthentication"] = "https://developer.x.com/en/support/x-api/error-troubleshooting#unsupported-authentication";
  EApiV2ErrorCode2["InvalidRules"] = "https://developer.x.com/en/support/x-api/error-troubleshooting#invalid-rules";
  EApiV2ErrorCode2["TooManyRules"] = "https://developer.x.com/en/support/x-api/error-troubleshooting#rule-cap";
  EApiV2ErrorCode2["DuplicatedRules"] = "https://developer.x.com/en/support/x-api/error-troubleshooting#duplicate-rules";
  EApiV2ErrorCode2["RateLimitExceeded"] = "https://developer.x.com/en/support/x-api/error-troubleshooting#usage-capped";
  EApiV2ErrorCode2["ConnectionError"] = "https://developer.x.com/en/support/x-api/error-troubleshooting#streaming-connection";
  EApiV2ErrorCode2["ClientDisconnected"] = "https://developer.x.com/en/support/x-api/error-troubleshooting#client-disconnected";
  EApiV2ErrorCode2["TwitterDisconnectedYou"] = "https://developer.x.com/en/support/x-api/error-troubleshooting#operational-disconnect";
  EApiV2ErrorCode2["ResourceNotFound"] = "https://developer.x.com/en/support/x-api/error-troubleshooting#resource-not-found";
  EApiV2ErrorCode2["ResourceUnauthorized"] = "https://developer.x.com/en/support/x-api/error-troubleshooting#not-authorized-for-resource";
  EApiV2ErrorCode2["DisallowedResource"] = "https://developer.x.com/en/support/x-api/error-troubleshooting#disallowed-resource";
})(EApiV2ErrorCode || (EApiV2ErrorCode = {}));

// node_modules/twitter-api-v2/dist/esm/types/client.types.js
var ETwitterStreamEvent;
(function(ETwitterStreamEvent2) {
  ETwitterStreamEvent2["Connected"] = "connected";
  ETwitterStreamEvent2["ConnectError"] = "connect error";
  ETwitterStreamEvent2["ConnectionError"] = "connection error";
  ETwitterStreamEvent2["ConnectionClosed"] = "connection closed";
  ETwitterStreamEvent2["ConnectionLost"] = "connection lost";
  ETwitterStreamEvent2["ReconnectAttempt"] = "reconnect attempt";
  ETwitterStreamEvent2["Reconnected"] = "reconnected";
  ETwitterStreamEvent2["ReconnectError"] = "reconnect error";
  ETwitterStreamEvent2["ReconnectLimitExceeded"] = "reconnect limit exceeded";
  ETwitterStreamEvent2["DataKeepAlive"] = "data keep-alive";
  ETwitterStreamEvent2["Data"] = "data event content";
  ETwitterStreamEvent2["DataError"] = "data twitter error";
  ETwitterStreamEvent2["TweetParseError"] = "data tweet parse error";
  ETwitterStreamEvent2["Error"] = "stream error";
})(ETwitterStreamEvent || (ETwitterStreamEvent = {}));

// node_modules/twitter-api-v2/dist/esm/types/plugins/client.plugins.types.js
var TwitterApiPluginResponseOverride = class {
  constructor(value) {
    this.value = value;
  }
};

// node_modules/twitter-api-v2/dist/esm/settings.js
var TwitterApiV2Settings = {
  logger: { log: console.log.bind(console) }
};

// node_modules/twitter-api-v2/dist/esm/helpers.js
function sharedPromise(getter) {
  const sharedPromise2 = {
    value: void 0,
    promise: getter().then((val) => {
      sharedPromise2.value = val;
      return val;
    })
  };
  return sharedPromise2;
}
function arrayWrap(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
}
function trimUndefinedProperties(object) {
  for (const parameter of Object.keys(object)) {
    if (object[parameter] === void 0) {
      delete object[parameter];
    }
  }
}
function isTweetStreamV2ErrorPayload(payload) {
  return typeof payload === "object" && "errors" in payload && !("data" in payload);
}
function hasMultipleItems(item) {
  if (Array.isArray(item) && item.length > 1) {
    return true;
  }
  return item.toString().includes(",");
}
var deprecationWarningsCache = /* @__PURE__ */ new Set();
function safeDeprecationWarning(message) {
  if (typeof console === "undefined" || !console.warn || false) {
    return;
  }
  const hash = `${message.instance}-${message.method}-${message.problem}`;
  if (deprecationWarningsCache.has(hash)) {
    return;
  }
  const formattedMsg = `[twitter-api-v2] Deprecation warning: In ${message.instance}.${message.method}() call, ${message.problem}.
${message.resolution}.`;
  console.warn(formattedMsg);
  console.warn("To disable this message, import variable TwitterApiV2Settings from twitter-api-v2 and set TwitterApiV2Settings.deprecationWarnings to false.");
  deprecationWarningsCache.add(hash);
}
var RequestHandlerHelper = class {
  constructor(requestData) {
    this.requestData = requestData;
    this.requestErrorHandled = false;
    this.responseData = [];
  }
  /* Request helpers */
  get hrefPathname() {
    const url = this.requestData.url;
    return url.hostname + url.pathname;
  }
  isCompressionDisabled() {
    return !this.requestData.compression || this.requestData.compression === "identity";
  }
  isFormEncodedEndpoint() {
    return this.requestData.url.href.startsWith("https://api.x.com/oauth/");
  }
  /* Error helpers */
  createRequestError(error) {
    return new ApiRequestError("Request failed.", {
      request: this.req,
      error
    });
  }
  createPartialResponseError(error, abortClose) {
    const res = this.res;
    let message = `Request failed with partial response with HTTP code ${res.statusCode}`;
    if (abortClose) {
      message += " (connection abruptly closed)";
    } else {
      message += " (parse error)";
    }
    return new ApiPartialResponseError(message, {
      request: this.req,
      response: this.res,
      responseError: error,
      rawContent: Buffer.concat(this.responseData).toString()
    });
  }
  formatV1Errors(errors) {
    return errors.map(({ code, message }) => `${message} (Twitter code ${code})`).join(", ");
  }
  formatV2Error(error) {
    return `${error.title}: ${error.detail} (see ${error.type})`;
  }
  createResponseError({ res, data, rateLimit, code }) {
    var _a;
    let errorString = `Request failed with code ${code}`;
    if ((_a = data === null || data === void 0 ? void 0 : data.errors) === null || _a === void 0 ? void 0 : _a.length) {
      const errors = data.errors;
      if (typeof errors[0] === "object" && "code" in errors[0]) {
        errorString += " - " + this.formatV1Errors(errors);
      } else {
        errorString += " - " + this.formatV2Error(data);
      }
    }
    return new ApiResponseError(errorString, {
      code,
      data,
      headers: res.headers,
      request: this.req,
      response: res,
      rateLimit
    });
  }
  /* Response helpers */
  getResponseDataStream(res) {
    if (this.isCompressionDisabled()) {
      return res;
    }
    const contentEncoding = (res.headers["content-encoding"] || "identity").trim().toLowerCase();
    if (contentEncoding === "br") {
      const brotli = zlib.createBrotliDecompress({
        flush: zlib.constants.BROTLI_OPERATION_FLUSH,
        finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH
      });
      res.pipe(brotli);
      return brotli;
    }
    if (contentEncoding === "gzip") {
      const gunzip = zlib.createGunzip({
        flush: zlib.constants.Z_SYNC_FLUSH,
        finishFlush: zlib.constants.Z_SYNC_FLUSH
      });
      res.pipe(gunzip);
      return gunzip;
    }
    if (contentEncoding === "deflate") {
      const inflate = zlib.createInflate({
        flush: zlib.constants.Z_SYNC_FLUSH,
        finishFlush: zlib.constants.Z_SYNC_FLUSH
      });
      res.pipe(inflate);
      return inflate;
    }
    return res;
  }
  detectResponseType(res) {
    var _a, _b;
    if (((_a = res.headers["content-type"]) === null || _a === void 0 ? void 0 : _a.includes("application/json")) || ((_b = res.headers["content-type"]) === null || _b === void 0 ? void 0 : _b.includes("application/problem+json"))) {
      return "json";
    } else if (this.isFormEncodedEndpoint()) {
      return "url";
    }
    return "text";
  }
  getParsedResponse(res) {
    const data = this.responseData;
    const mode = this.requestData.forceParseMode || this.detectResponseType(res);
    if (mode === "buffer") {
      return Buffer.concat(data);
    } else if (mode === "text") {
      return Buffer.concat(data).toString();
    } else if (mode === "json") {
      const asText = Buffer.concat(data).toString();
      return asText.length ? JSON.parse(asText) : void 0;
    } else if (mode === "url") {
      const asText = Buffer.concat(data).toString();
      const formEntries = {};
      for (const [item, value] of new URLSearchParams(asText)) {
        formEntries[item] = value;
      }
      return formEntries;
    } else {
      return void 0;
    }
  }
  getRateLimitFromResponse(res) {
    let rateLimit = void 0;
    if (res.headers["x-rate-limit-limit"]) {
      rateLimit = {
        limit: Number(res.headers["x-rate-limit-limit"]),
        remaining: Number(res.headers["x-rate-limit-remaining"]),
        reset: Number(res.headers["x-rate-limit-reset"])
      };
      if (res.headers["x-app-limit-24hour-limit"]) {
        rateLimit.day = {
          limit: Number(res.headers["x-app-limit-24hour-limit"]),
          remaining: Number(res.headers["x-app-limit-24hour-remaining"]),
          reset: Number(res.headers["x-app-limit-24hour-reset"])
        };
      }
      if (res.headers["x-user-limit-24hour-limit"]) {
        rateLimit.userDay = {
          limit: Number(res.headers["x-user-limit-24hour-limit"]),
          remaining: Number(res.headers["x-user-limit-24hour-remaining"]),
          reset: Number(res.headers["x-user-limit-24hour-reset"])
        };
      }
      if (this.requestData.rateLimitSaver) {
        this.requestData.rateLimitSaver(rateLimit);
      }
    }
    return rateLimit;
  }
  /* Request event handlers */
  onSocketEventHandler(reject, cleanupListener, socket) {
    const onClose = this.onSocketCloseHandler.bind(this, reject);
    socket.on("close", onClose);
    cleanupListener.on("complete", () => socket.off("close", onClose));
  }
  onSocketCloseHandler(reject) {
    this.req.removeAllListeners("timeout");
    const res = this.res;
    if (res) {
      return;
    }
    if (!this.requestErrorHandled) {
      return reject(this.createRequestError(new Error("Socket closed without any information.")));
    }
  }
  requestErrorHandler(reject, requestError) {
    var _a, _b;
    (_b = (_a = this.requestData).requestEventDebugHandler) === null || _b === void 0 ? void 0 : _b.call(_a, "request-error", { requestError });
    this.requestErrorHandled = true;
    reject(this.createRequestError(requestError));
  }
  timeoutErrorHandler() {
    this.requestErrorHandled = true;
    this.req.destroy(new Error("Request timeout."));
  }
  /* Response event handlers */
  classicResponseHandler(resolve, reject, res) {
    this.res = res;
    const dataStream = this.getResponseDataStream(res);
    dataStream.on("data", (chunk) => this.responseData.push(chunk));
    dataStream.on("end", this.onResponseEndHandler.bind(this, resolve, reject));
    dataStream.on("close", this.onResponseCloseHandler.bind(this, resolve, reject));
    if (this.requestData.requestEventDebugHandler) {
      this.requestData.requestEventDebugHandler("response", { res });
      res.on("aborted", (error) => this.requestData.requestEventDebugHandler("response-aborted", { error }));
      res.on("error", (error) => this.requestData.requestEventDebugHandler("response-error", { error }));
      res.on("close", () => this.requestData.requestEventDebugHandler("response-close", { data: this.responseData }));
      res.on("end", () => this.requestData.requestEventDebugHandler("response-end"));
    }
  }
  onResponseEndHandler(resolve, reject) {
    const rateLimit = this.getRateLimitFromResponse(this.res);
    let data;
    try {
      data = this.getParsedResponse(this.res);
    } catch (e) {
      reject(this.createPartialResponseError(e, false));
      return;
    }
    const code = this.res.statusCode;
    if (code >= 400) {
      reject(this.createResponseError({ data, res: this.res, rateLimit, code }));
      return;
    }
    resolve({
      data,
      headers: this.res.headers,
      rateLimit
    });
  }
  onResponseCloseHandler(resolve, reject) {
    const res = this.res;
    if (res.aborted) {
      try {
        this.getParsedResponse(this.res);
        return this.onResponseEndHandler(resolve, reject);
      } catch (e) {
        return reject(this.createPartialResponseError(e, true));
      }
    }
    if (!res.complete) {
      return reject(this.createPartialResponseError(new Error("Response has been interrupted before response could be parsed."), true));
    }
  }
  streamResponseHandler(resolve, reject, res) {
    const code = res.statusCode;
    if (code < 400) {
      const dataStream = this.getResponseDataStream(res);
      resolve({ req: this.req, res: dataStream, originalResponse: res, requestData: this.requestData });
    } else {
      this.classicResponseHandler(() => void 0, reject, res);
    }
  }
  /* Wrappers for request lifecycle */
  debugRequest() {
    const url = this.requestData.url;
    TwitterApiV2Settings.logger.log(`[${this.requestData.options.method} ${this.hrefPathname}]`, this.requestData.options);
    if (url.search) {
      TwitterApiV2Settings.logger.log("Request parameters:", [...url.searchParams.entries()].map(([key, value]) => `${key}: ${value}`));
    }
    if (this.requestData.body) {
      TwitterApiV2Settings.logger.log("Request body:", this.requestData.body);
    }
  }
  buildRequest() {
    var _a;
    const url = this.requestData.url;
    const auth2 = url.username ? `${url.username}:${url.password}` : void 0;
    const headers = (_a = this.requestData.options.headers) !== null && _a !== void 0 ? _a : {};
    if (this.requestData.compression === true || this.requestData.compression === "brotli") {
      headers["accept-encoding"] = "br;q=1.0, gzip;q=0.8, deflate;q=0.5, *;q=0.1";
    } else if (this.requestData.compression === "gzip") {
      headers["accept-encoding"] = "gzip;q=1, deflate;q=0.5, *;q=0.1";
    } else if (this.requestData.compression === "deflate") {
      headers["accept-encoding"] = "deflate;q=1, *;q=0.1";
    }
    this.req = request$1({
      ...this.requestData.options,
      // Define URL params manually, addresses dependencies error https://github.com/PLhery/node-twitter-api-v2/issues/94
      host: url.hostname,
      port: url.port || void 0,
      path: url.pathname + url.search,
      protocol: url.protocol,
      auth: auth2,
      headers
    });
  }
  registerRequestEventDebugHandlers(req) {
    req.on("close", () => this.requestData.requestEventDebugHandler("close"));
    req.on("abort", () => this.requestData.requestEventDebugHandler("abort"));
    req.on("socket", (socket) => {
      this.requestData.requestEventDebugHandler("socket", { socket });
      socket.on("error", (error) => this.requestData.requestEventDebugHandler("socket-error", { socket, error }));
      socket.on("connect", () => this.requestData.requestEventDebugHandler("socket-connect", { socket }));
      socket.on("close", (withError) => this.requestData.requestEventDebugHandler("socket-close", { socket, withError }));
      socket.on("end", () => this.requestData.requestEventDebugHandler("socket-end", { socket }));
      socket.on("lookup", (...data) => this.requestData.requestEventDebugHandler("socket-lookup", { socket, data }));
      socket.on("timeout", () => this.requestData.requestEventDebugHandler("socket-timeout", { socket }));
    });
  }
  makeRequest() {
    this.buildRequest();
    return new Promise((_resolve, _reject) => {
      const resolve = (value) => {
        cleanupListener.emit("complete");
        _resolve(value);
      };
      const reject = (value) => {
        cleanupListener.emit("complete");
        _reject(value);
      };
      const cleanupListener = new EventEmitter();
      const req = this.req;
      req.on("error", this.requestErrorHandler.bind(this, reject));
      req.on("socket", this.onSocketEventHandler.bind(this, reject, cleanupListener));
      req.on("response", this.classicResponseHandler.bind(this, resolve, reject));
      if (this.requestData.options.timeout) {
        req.on("timeout", this.timeoutErrorHandler.bind(this));
      }
      if (this.requestData.requestEventDebugHandler) {
        this.registerRequestEventDebugHandlers(req);
      }
      if (this.requestData.body) {
        req.write(this.requestData.body);
      }
      req.end();
    });
  }
  async makeRequestAsStream() {
    const { req, res, requestData, originalResponse } = await this.makeRequestAndResolveWhenReady();
    return new TweetStream_default(requestData, { req, res, originalResponse });
  }
  makeRequestAndResolveWhenReady() {
    this.buildRequest();
    return new Promise((resolve, reject) => {
      const req = this.req;
      req.on("error", this.requestErrorHandler.bind(this, reject));
      req.on("response", this.streamResponseHandler.bind(this, resolve, reject));
      if (this.requestData.body) {
        req.write(this.requestData.body);
      }
      req.end();
    });
  }
};
var request_handler_helper_default = RequestHandlerHelper;
var TweetStreamEventCombiner = class extends EventEmitter {
  constructor(stream) {
    super();
    this.stream = stream;
    this.stack = [];
    this.onStreamData = this.onStreamData.bind(this);
    this.onStreamError = this.onStreamError.bind(this);
    this.onceNewEvent = this.once.bind(this, "event");
    stream.on(ETwitterStreamEvent.Data, this.onStreamData);
    stream.on(ETwitterStreamEvent.ConnectionError, this.onStreamError);
    stream.on(ETwitterStreamEvent.TweetParseError, this.onStreamError);
    stream.on(ETwitterStreamEvent.ConnectionClosed, this.onStreamError);
  }
  /** Returns a new `Promise` that will `resolve` on next event (`data` or any sort of error). */
  nextEvent() {
    return new Promise(this.onceNewEvent);
  }
  /** Returns `true` if there's something in the stack. */
  hasStack() {
    return this.stack.length > 0;
  }
  /** Returns stacked data events, and clean the stack. */
  popStack() {
    const stack = this.stack;
    this.stack = [];
    return stack;
  }
  /** Cleanup all the listeners attached on stream. */
  destroy() {
    this.removeAllListeners();
    this.stream.off(ETwitterStreamEvent.Data, this.onStreamData);
    this.stream.off(ETwitterStreamEvent.ConnectionError, this.onStreamError);
    this.stream.off(ETwitterStreamEvent.TweetParseError, this.onStreamError);
    this.stream.off(ETwitterStreamEvent.ConnectionClosed, this.onStreamError);
  }
  emitEvent(type, payload) {
    this.emit("event", { type, payload });
  }
  onStreamError(payload) {
    this.emitEvent("error", payload);
  }
  onStreamData(payload) {
    this.stack.push(payload);
    this.emitEvent("data", payload);
  }
};
var TweetStreamEventCombiner_default = TweetStreamEventCombiner;
var TweetStreamParser = class extends EventEmitter {
  constructor() {
    super(...arguments);
    this.currentMessage = "";
  }
  // Code partially belongs to twitter-stream-api for this
  // https://github.com/trygve-lie/twitter-stream-api/blob/master/lib/parser.js
  push(chunk) {
    this.currentMessage += chunk;
    chunk = this.currentMessage;
    const size = chunk.length;
    let start = 0;
    let offset = 0;
    while (offset < size) {
      if (chunk.slice(offset, offset + 2) === "\r\n") {
        const piece = chunk.slice(start, offset);
        start = offset += 2;
        if (!piece.length) {
          continue;
        }
        try {
          const payload = JSON.parse(piece);
          if (payload) {
            this.emit(EStreamParserEvent.ParsedData, payload);
            continue;
          }
        } catch (error) {
          this.emit(EStreamParserEvent.ParseError, error);
        }
      }
      offset++;
    }
    this.currentMessage = chunk.slice(start, size);
  }
  /** Reset the currently stored message (f.e. on connection reset) */
  reset() {
    this.currentMessage = "";
  }
};
var EStreamParserEvent;
(function(EStreamParserEvent2) {
  EStreamParserEvent2["ParsedData"] = "parsed data";
  EStreamParserEvent2["ParseError"] = "parse error";
})(EStreamParserEvent || (EStreamParserEvent = {}));

// node_modules/twitter-api-v2/dist/esm/stream/TweetStream.js
var basicRetriesAttempt = [5, 15, 30, 60, 90, 120, 180, 300, 600, 900];
var basicReconnectRetry = (tryOccurrence) => tryOccurrence > basicRetriesAttempt.length ? 901e3 : basicRetriesAttempt[tryOccurrence - 1] * 1e3;
var TweetStream = class extends EventEmitter {
  constructor(requestData, connection) {
    super();
    this.requestData = requestData;
    this.autoReconnect = false;
    this.autoReconnectRetries = 5;
    this.keepAliveTimeoutMs = 1e3 * 120;
    this.nextRetryTimeout = basicReconnectRetry;
    this.parser = new TweetStreamParser();
    this.connectionProcessRunning = false;
    this.onKeepAliveTimeout = this.onKeepAliveTimeout.bind(this);
    this.initEventsFromParser();
    if (connection) {
      this.req = connection.req;
      this.res = connection.res;
      this.originalResponse = connection.originalResponse;
      this.initEventsFromRequest();
    }
  }
  on(event, handler2) {
    return super.on(event, handler2);
  }
  initEventsFromRequest() {
    if (!this.req || !this.res) {
      throw new Error("TweetStream error: You cannot init TweetStream without a request and response object.");
    }
    const errorHandler = (err) => {
      this.emit(ETwitterStreamEvent.ConnectionError, err);
      this.emit(ETwitterStreamEvent.Error, {
        type: ETwitterStreamEvent.ConnectionError,
        error: err,
        message: "Connection lost or closed by Twitter."
      });
      this.onConnectionError();
    };
    this.req.on("error", errorHandler);
    this.res.on("error", errorHandler);
    this.res.on("close", () => errorHandler(new Error("Connection closed by Twitter.")));
    this.res.on("data", (chunk) => {
      this.resetKeepAliveTimeout();
      if (chunk.toString() === "\r\n") {
        return this.emit(ETwitterStreamEvent.DataKeepAlive);
      }
      this.parser.push(chunk.toString());
    });
    this.resetKeepAliveTimeout();
  }
  initEventsFromParser() {
    const payloadIsError = this.requestData.payloadIsError;
    this.parser.on(EStreamParserEvent.ParsedData, (eventData) => {
      if (payloadIsError && payloadIsError(eventData)) {
        this.emit(ETwitterStreamEvent.DataError, eventData);
        this.emit(ETwitterStreamEvent.Error, {
          type: ETwitterStreamEvent.DataError,
          error: eventData,
          message: "Twitter sent a payload that is detected as an error payload."
        });
      } else {
        this.emit(ETwitterStreamEvent.Data, eventData);
      }
    });
    this.parser.on(EStreamParserEvent.ParseError, (error) => {
      this.emit(ETwitterStreamEvent.TweetParseError, error);
      this.emit(ETwitterStreamEvent.Error, {
        type: ETwitterStreamEvent.TweetParseError,
        error,
        message: "Failed to parse stream data."
      });
    });
  }
  resetKeepAliveTimeout() {
    this.unbindKeepAliveTimeout();
    if (this.keepAliveTimeoutMs !== Infinity) {
      this.keepAliveTimeout = setTimeout(this.onKeepAliveTimeout, this.keepAliveTimeoutMs);
    }
  }
  onKeepAliveTimeout() {
    this.emit(ETwitterStreamEvent.ConnectionLost);
    this.onConnectionError();
  }
  unbindTimeouts() {
    this.unbindRetryTimeout();
    this.unbindKeepAliveTimeout();
  }
  unbindKeepAliveTimeout() {
    if (this.keepAliveTimeout) {
      clearTimeout(this.keepAliveTimeout);
      this.keepAliveTimeout = void 0;
    }
  }
  unbindRetryTimeout() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = void 0;
    }
  }
  closeWithoutEmit() {
    this.unbindTimeouts();
    if (this.res) {
      this.res.removeAllListeners();
      this.res.destroy();
    }
    if (this.req) {
      this.req.removeAllListeners();
      this.req.destroy();
    }
  }
  /** Terminate connection to Twitter. */
  close() {
    this.emit(ETwitterStreamEvent.ConnectionClosed);
    this.closeWithoutEmit();
  }
  /** Unbind all listeners, and close connection. */
  destroy() {
    this.removeAllListeners();
    this.close();
  }
  /**
   * Make a new request that creates a new `TweetStream` instance with
   * the same parameters, and bind current listeners to new stream.
   */
  async clone() {
    const newRequest = new request_handler_helper_default(this.requestData);
    const newStream = await newRequest.makeRequestAsStream();
    const listenerNames = this.eventNames();
    for (const listener of listenerNames) {
      const callbacks = this.listeners(listener);
      for (const callback of callbacks) {
        newStream.on(listener, callback);
      }
    }
    return newStream;
  }
  /** Start initial stream connection, setup options on current instance and returns itself. */
  async connect(options = {}) {
    if (typeof options.autoReconnect !== "undefined") {
      this.autoReconnect = options.autoReconnect;
    }
    if (typeof options.autoReconnectRetries !== "undefined") {
      this.autoReconnectRetries = options.autoReconnectRetries === "unlimited" ? Infinity : options.autoReconnectRetries;
    }
    if (typeof options.keepAliveTimeout !== "undefined") {
      this.keepAliveTimeoutMs = options.keepAliveTimeout === "disable" ? Infinity : options.keepAliveTimeout;
    }
    if (typeof options.nextRetryTimeout !== "undefined") {
      this.nextRetryTimeout = options.nextRetryTimeout;
    }
    this.unbindTimeouts();
    try {
      await this.reconnect();
    } catch (e) {
      this.emit(ETwitterStreamEvent.ConnectError, 0);
      this.emit(ETwitterStreamEvent.Error, {
        type: ETwitterStreamEvent.ConnectError,
        error: e,
        message: "Connect error - Initial connection just failed."
      });
      if (this.autoReconnect) {
        this.makeAutoReconnectRetry(0, e);
      } else {
        throw e;
      }
    }
    return this;
  }
  /** Make a new request to (re)connect to Twitter. */
  async reconnect() {
    if (this.connectionProcessRunning) {
      throw new Error("Connection process is already running.");
    }
    this.connectionProcessRunning = true;
    try {
      let initialConnection = true;
      if (this.req) {
        initialConnection = false;
        this.closeWithoutEmit();
      }
      const { req, res, originalResponse } = await new request_handler_helper_default(this.requestData).makeRequestAndResolveWhenReady();
      this.req = req;
      this.res = res;
      this.originalResponse = originalResponse;
      this.emit(initialConnection ? ETwitterStreamEvent.Connected : ETwitterStreamEvent.Reconnected);
      this.parser.reset();
      this.initEventsFromRequest();
    } finally {
      this.connectionProcessRunning = false;
    }
  }
  async onConnectionError(retryOccurrence = 0) {
    this.unbindTimeouts();
    this.closeWithoutEmit();
    if (!this.autoReconnect) {
      this.emit(ETwitterStreamEvent.ConnectionClosed);
      return;
    }
    if (retryOccurrence >= this.autoReconnectRetries) {
      this.emit(ETwitterStreamEvent.ReconnectLimitExceeded);
      this.emit(ETwitterStreamEvent.ConnectionClosed);
      return;
    }
    try {
      this.emit(ETwitterStreamEvent.ReconnectAttempt, retryOccurrence);
      await this.reconnect();
    } catch (e) {
      this.emit(ETwitterStreamEvent.ReconnectError, retryOccurrence);
      this.emit(ETwitterStreamEvent.Error, {
        type: ETwitterStreamEvent.ReconnectError,
        error: e,
        message: `Reconnect error - ${retryOccurrence + 1} attempts made yet.`
      });
      this.makeAutoReconnectRetry(retryOccurrence, e);
    }
  }
  makeAutoReconnectRetry(retryOccurrence, error) {
    const nextRetry = this.nextRetryTimeout(retryOccurrence + 1, error);
    this.retryTimeout = setTimeout(() => {
      this.onConnectionError(retryOccurrence + 1);
    }, nextRetry);
  }
  async *[Symbol.asyncIterator]() {
    const eventCombiner = new TweetStreamEventCombiner_default(this);
    try {
      while (true) {
        if (!this.req || this.req.aborted) {
          throw new Error("Connection closed");
        }
        if (eventCombiner.hasStack()) {
          yield* eventCombiner.popStack();
        }
        const { type, payload } = await eventCombiner.nextEvent();
        if (type === "error") {
          throw payload;
        }
      }
    } finally {
      eventCombiner.destroy();
    }
  }
};
var TweetStream_default = TweetStream;

// node_modules/twitter-api-v2/dist/esm/plugins/helpers.js
function hasRequestErrorPlugins(client) {
  var _a;
  if (!((_a = client.clientSettings.plugins) === null || _a === void 0 ? void 0 : _a.length)) {
    return false;
  }
  for (const plugin of client.clientSettings.plugins) {
    if (plugin.onRequestError || plugin.onResponseError) {
      return true;
    }
  }
  return false;
}
async function applyResponseHooks(requestParams, computedParams, requestOptions, error) {
  let override;
  if (error instanceof ApiRequestError || error instanceof ApiPartialResponseError) {
    override = await this.applyPluginMethod("onRequestError", {
      client: this,
      url: this.getUrlObjectFromUrlString(requestParams.url),
      params: requestParams,
      computedParams,
      requestOptions,
      error
    });
  } else if (error instanceof ApiResponseError) {
    override = await this.applyPluginMethod("onResponseError", {
      client: this,
      url: this.getUrlObjectFromUrlString(requestParams.url),
      params: requestParams,
      computedParams,
      requestOptions,
      error
    });
  }
  if (override && override instanceof TwitterApiPluginResponseOverride) {
    return override.value;
  }
  return Promise.reject(error);
}
var OAuth1Helper = class _OAuth1Helper {
  constructor(options) {
    this.nonceLength = 32;
    this.consumerKeys = options.consumerKeys;
  }
  static percentEncode(str) {
    return encodeURIComponent(str).replace(/!/g, "%21").replace(/\*/g, "%2A").replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29");
  }
  hash(base, key) {
    return crypto.createHmac("sha1", key).update(base).digest("base64");
  }
  authorize(request3, accessTokens = {}) {
    const oauthInfo = {
      oauth_consumer_key: this.consumerKeys.key,
      oauth_nonce: this.getNonce(),
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: this.getTimestamp(),
      oauth_version: "1.0"
    };
    if (accessTokens.key !== void 0) {
      oauthInfo.oauth_token = accessTokens.key;
    }
    if (!request3.data) {
      request3.data = {};
    }
    oauthInfo.oauth_signature = this.getSignature(request3, accessTokens.secret, oauthInfo);
    return oauthInfo;
  }
  toHeader(oauthInfo) {
    const sorted = sortObject(oauthInfo);
    let header_value = "OAuth ";
    for (const element of sorted) {
      if (element.key.indexOf("oauth_") !== 0) {
        continue;
      }
      header_value += _OAuth1Helper.percentEncode(element.key) + '="' + _OAuth1Helper.percentEncode(element.value) + '",';
    }
    return {
      // Remove the last ,
      Authorization: header_value.slice(0, header_value.length - 1)
    };
  }
  getNonce() {
    const wordCharacters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < this.nonceLength; i++) {
      result += wordCharacters[Math.trunc(Math.random() * wordCharacters.length)];
    }
    return result;
  }
  getTimestamp() {
    return Math.trunc((/* @__PURE__ */ new Date()).getTime() / 1e3);
  }
  getSignature(request3, tokenSecret, oauthInfo) {
    return this.hash(this.getBaseString(request3, oauthInfo), this.getSigningKey(tokenSecret));
  }
  getSigningKey(tokenSecret) {
    return _OAuth1Helper.percentEncode(this.consumerKeys.secret) + "&" + _OAuth1Helper.percentEncode(tokenSecret || "");
  }
  getBaseString(request3, oauthInfo) {
    return request3.method.toUpperCase() + "&" + _OAuth1Helper.percentEncode(this.getBaseUrl(request3.url)) + "&" + _OAuth1Helper.percentEncode(this.getParameterString(request3, oauthInfo));
  }
  getParameterString(request3, oauthInfo) {
    const baseStringData = sortObject(percentEncodeData(mergeObject(oauthInfo, mergeObject(request3.data, deParamUrl(request3.url)))));
    let dataStr = "";
    for (const { key, value } of baseStringData) {
      if (value && Array.isArray(value)) {
        value.sort();
        let valString = "";
        value.forEach((item, i) => {
          valString += key + "=" + item;
          if (i < value.length) {
            valString += "&";
          }
        });
        dataStr += valString;
      } else {
        dataStr += key + "=" + value + "&";
      }
    }
    return dataStr.slice(0, dataStr.length - 1);
  }
  getBaseUrl(url) {
    return url.split("?")[0];
  }
};
var oauth1_helper_default = OAuth1Helper;
function mergeObject(obj1, obj2) {
  return {
    ...obj1 || {},
    ...obj2 || {}
  };
}
function sortObject(data) {
  return Object.keys(data).sort().map((key) => ({ key, value: data[key] }));
}
function deParam(string) {
  const split = string.split("&");
  const data = {};
  for (const coupleKeyValue of split) {
    const [key, value = ""] = coupleKeyValue.split("=");
    if (data[key]) {
      if (!Array.isArray(data[key])) {
        data[key] = [data[key]];
      }
      data[key].push(decodeURIComponent(value));
    } else {
      data[key] = decodeURIComponent(value);
    }
  }
  return data;
}
function deParamUrl(url) {
  const tmp = url.split("?");
  if (tmp.length === 1)
    return {};
  return deParam(tmp[1]);
}
function percentEncodeData(data) {
  const result = {};
  for (const key in data) {
    let value = data[key];
    if (value && Array.isArray(value)) {
      value = value.map((v) => OAuth1Helper.percentEncode(v));
    } else {
      value = OAuth1Helper.percentEncode(value);
    }
    result[OAuth1Helper.percentEncode(key)] = value;
  }
  return result;
}

// node_modules/twitter-api-v2/dist/esm/client-mixins/form-data.helper.js
var FormDataHelper = class _FormDataHelper {
  constructor() {
    this._boundary = "";
    this._chunks = [];
  }
  bodyAppend(...values) {
    const allAsBuffer = values.map((val) => val instanceof Buffer ? val : Buffer.from(val));
    this._chunks.push(...allAsBuffer);
  }
  append(field, value, contentType) {
    const convertedValue = value instanceof Buffer ? value : value.toString();
    const header = this.getMultipartHeader(field, convertedValue, contentType);
    this.bodyAppend(header, convertedValue, _FormDataHelper.LINE_BREAK);
  }
  getHeaders() {
    return {
      "content-type": "multipart/form-data; boundary=" + this.getBoundary()
    };
  }
  /** Length of form-data (including footer length). */
  getLength() {
    return this._chunks.reduce((acc, cur) => acc + cur.length, this.getMultipartFooter().length);
  }
  getBuffer() {
    const allChunks = [...this._chunks, this.getMultipartFooter()];
    const totalBuffer = Buffer.alloc(this.getLength());
    let i = 0;
    for (const chunk of allChunks) {
      for (let j = 0; j < chunk.length; i++, j++) {
        totalBuffer[i] = chunk[j];
      }
    }
    return totalBuffer;
  }
  getBoundary() {
    if (!this._boundary) {
      this.generateBoundary();
    }
    return this._boundary;
  }
  generateBoundary() {
    let boundary = "--------------------------";
    for (let i = 0; i < 24; i++) {
      boundary += Math.floor(Math.random() * 10).toString(16);
    }
    this._boundary = boundary;
  }
  getMultipartHeader(field, value, contentType) {
    if (!contentType) {
      contentType = value instanceof Buffer ? _FormDataHelper.DEFAULT_CONTENT_TYPE : "";
    }
    const headers = {
      "Content-Disposition": ["form-data", `name="${field}"`],
      "Content-Type": contentType
    };
    let contents = "";
    for (const [prop, header] of Object.entries(headers)) {
      if (!header.length) {
        continue;
      }
      contents += prop + ": " + arrayWrap(header).join("; ") + _FormDataHelper.LINE_BREAK;
    }
    return "--" + this.getBoundary() + _FormDataHelper.LINE_BREAK + contents + _FormDataHelper.LINE_BREAK;
  }
  getMultipartFooter() {
    if (this._footerChunk) {
      return this._footerChunk;
    }
    return this._footerChunk = Buffer.from("--" + this.getBoundary() + "--" + _FormDataHelper.LINE_BREAK);
  }
};
FormDataHelper.LINE_BREAK = "\r\n";
FormDataHelper.DEFAULT_CONTENT_TYPE = "application/octet-stream";

// node_modules/twitter-api-v2/dist/esm/client-mixins/request-param.helper.js
var RequestParamHelpers = class {
  static formatQueryToString(query) {
    const formattedQuery = {};
    for (const prop in query) {
      if (typeof query[prop] === "string") {
        formattedQuery[prop] = query[prop];
      } else if (typeof query[prop] !== "undefined") {
        formattedQuery[prop] = String(query[prop]);
      }
    }
    return formattedQuery;
  }
  static autoDetectBodyType(url) {
    if (url.pathname.startsWith("/2/") || url.pathname.startsWith("/labs/2/")) {
      if (url.password.startsWith("/2/oauth2")) {
        return "url";
      }
      return "json";
    }
    if (url.hostname === "upload.x.com") {
      if (url.pathname === "/1.1/media/upload.json") {
        return "form-data";
      }
      return "json";
    }
    const endpoint2 = url.pathname.split("/1.1/", 2)[1];
    if (this.JSON_1_1_ENDPOINTS.has(endpoint2)) {
      return "json";
    }
    return "url";
  }
  static addQueryParamsToUrl(url, query) {
    const queryEntries = Object.entries(query);
    if (queryEntries.length) {
      let search = "";
      for (const [key, value] of queryEntries) {
        search += (search.length ? "&" : "?") + `${oauth1_helper_default.percentEncode(key)}=${oauth1_helper_default.percentEncode(value)}`;
      }
      url.search = search;
    }
  }
  static constructBodyParams(body, headers, mode) {
    if (body instanceof Buffer) {
      return body;
    }
    if (mode === "json") {
      if (!headers["content-type"]) {
        headers["content-type"] = "application/json;charset=UTF-8";
      }
      return JSON.stringify(body);
    } else if (mode === "url") {
      if (!headers["content-type"]) {
        headers["content-type"] = "application/x-www-form-urlencoded;charset=UTF-8";
      }
      if (Object.keys(body).length) {
        return new URLSearchParams(body).toString().replace(/\*/g, "%2A");
      }
      return "";
    } else if (mode === "raw") {
      throw new Error("You can only use raw body mode with Buffers. To give a string, use Buffer.from(str).");
    } else {
      const form = new FormDataHelper();
      for (const parameter in body) {
        form.append(parameter, body[parameter]);
      }
      if (!headers["content-type"]) {
        const formHeaders = form.getHeaders();
        headers["content-type"] = formHeaders["content-type"];
      }
      return form.getBuffer();
    }
  }
  static setBodyLengthHeader(options, body) {
    var _a;
    options.headers = (_a = options.headers) !== null && _a !== void 0 ? _a : {};
    if (typeof body === "string") {
      options.headers["content-length"] = Buffer.byteLength(body);
    } else {
      options.headers["content-length"] = body.length;
    }
  }
  static isOAuthSerializable(item) {
    return !(item instanceof Buffer);
  }
  static mergeQueryAndBodyForOAuth(query, body) {
    const parameters = {};
    for (const prop in query) {
      parameters[prop] = query[prop];
    }
    if (this.isOAuthSerializable(body)) {
      for (const prop in body) {
        const bodyProp = body[prop];
        if (this.isOAuthSerializable(bodyProp)) {
          parameters[prop] = typeof bodyProp === "object" && bodyProp !== null && "toString" in bodyProp ? bodyProp.toString() : bodyProp;
        }
      }
    }
    return parameters;
  }
  static moveUrlQueryParamsIntoObject(url, query) {
    for (const [param, value] of url.searchParams) {
      query[param] = value;
    }
    url.search = "";
    return url;
  }
  /**
   * Replace URL parameters available in pathname, like `:id`, with data given in `parameters`:
   * `https://x.com/:id.json` + `{ id: '20' }` => `https://x.com/20.json`
   */
  static applyRequestParametersToUrl(url, parameters) {
    url.pathname = url.pathname.replace(/:([A-Z_-]+)/ig, (fullMatch, paramName) => {
      if (parameters[paramName] !== void 0) {
        return String(parameters[paramName]);
      }
      return fullMatch;
    });
    return url;
  }
};
RequestParamHelpers.JSON_1_1_ENDPOINTS = /* @__PURE__ */ new Set([
  "direct_messages/events/new.json",
  "direct_messages/welcome_messages/new.json",
  "direct_messages/welcome_messages/rules/new.json",
  "media/metadata/create.json",
  "collections/entries/curate.json"
]);
var request_param_helper_default = RequestParamHelpers;
var OAuth2Helper = class {
  static getCodeVerifier() {
    return this.generateRandomString(128);
  }
  static getCodeChallengeFromVerifier(verifier) {
    return this.escapeBase64Url(crypto.createHash("sha256").update(verifier).digest("base64"));
  }
  static getAuthHeader(clientId, clientSecret) {
    const key = encodeURIComponent(clientId) + ":" + encodeURIComponent(clientSecret);
    return Buffer.from(key).toString("base64");
  }
  static generateRandomString(length) {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    for (let i = 0; i < length; i++) {
      text += possible[Math.floor(Math.random() * possible.length)];
    }
    return text;
  }
  static escapeBase64Url(string) {
    return string.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }
};

// node_modules/twitter-api-v2/dist/esm/client-mixins/request-maker.mixin.js
var ClientRequestMaker = class _ClientRequestMaker {
  constructor(settings) {
    this.rateLimits = {};
    this.clientSettings = {};
    if (settings) {
      this.clientSettings = settings;
    }
  }
  /** @deprecated - Switch to `@twitter-api-v2/plugin-rate-limit` */
  getRateLimits() {
    return this.rateLimits;
  }
  saveRateLimit(originalUrl, rateLimit) {
    this.rateLimits[originalUrl] = rateLimit;
  }
  /** Send a new request and returns a wrapped `Promise<TwitterResponse<T>`. */
  async send(requestParams) {
    var _a, _b, _c, _d, _e;
    if ((_a = this.clientSettings.plugins) === null || _a === void 0 ? void 0 : _a.length) {
      const possibleResponse = await this.applyPreRequestConfigHooks(requestParams);
      if (possibleResponse) {
        return possibleResponse;
      }
    }
    const args = this.getHttpRequestArgs(requestParams);
    const options = {
      method: args.method,
      headers: args.headers,
      timeout: requestParams.timeout,
      agent: this.clientSettings.httpAgent
    };
    const enableRateLimitSave = requestParams.enableRateLimitSave !== false;
    if (args.body) {
      request_param_helper_default.setBodyLengthHeader(options, args.body);
    }
    if ((_b = this.clientSettings.plugins) === null || _b === void 0 ? void 0 : _b.length) {
      await this.applyPreRequestHooks(requestParams, args, options);
    }
    let request3 = new request_handler_helper_default({
      url: args.url,
      options,
      body: args.body,
      rateLimitSaver: enableRateLimitSave ? this.saveRateLimit.bind(this, args.rawUrl) : void 0,
      requestEventDebugHandler: requestParams.requestEventDebugHandler,
      compression: (_d = (_c = requestParams.compression) !== null && _c !== void 0 ? _c : this.clientSettings.compression) !== null && _d !== void 0 ? _d : true,
      forceParseMode: requestParams.forceParseMode
    }).makeRequest();
    if (hasRequestErrorPlugins(this)) {
      request3 = this.applyResponseErrorHooks(requestParams, args, options, request3);
    }
    const response = await request3;
    if ((_e = this.clientSettings.plugins) === null || _e === void 0 ? void 0 : _e.length) {
      const responseOverride = await this.applyPostRequestHooks(requestParams, args, options, response);
      if (responseOverride) {
        return responseOverride.value;
      }
    }
    return response;
  }
  sendStream(requestParams) {
    var _a, _b;
    if (this.clientSettings.plugins) {
      this.applyPreStreamRequestConfigHooks(requestParams);
    }
    const args = this.getHttpRequestArgs(requestParams);
    const options = {
      method: args.method,
      headers: args.headers,
      agent: this.clientSettings.httpAgent
    };
    const enableRateLimitSave = requestParams.enableRateLimitSave !== false;
    const enableAutoConnect = requestParams.autoConnect !== false;
    if (args.body) {
      request_param_helper_default.setBodyLengthHeader(options, args.body);
    }
    const requestData = {
      url: args.url,
      options,
      body: args.body,
      rateLimitSaver: enableRateLimitSave ? this.saveRateLimit.bind(this, args.rawUrl) : void 0,
      payloadIsError: requestParams.payloadIsError,
      compression: (_b = (_a = requestParams.compression) !== null && _a !== void 0 ? _a : this.clientSettings.compression) !== null && _b !== void 0 ? _b : true
    };
    const stream = new TweetStream_default(requestData);
    if (!enableAutoConnect) {
      return stream;
    }
    return stream.connect();
  }
  /* Token helpers */
  initializeToken(token) {
    if (typeof token === "string") {
      this.bearerToken = token;
    } else if (typeof token === "object" && "appKey" in token) {
      this.consumerToken = token.appKey;
      this.consumerSecret = token.appSecret;
      if (token.accessToken && token.accessSecret) {
        this.accessToken = token.accessToken;
        this.accessSecret = token.accessSecret;
      }
      this._oauth = this.buildOAuth();
    } else if (typeof token === "object" && "username" in token) {
      const key = encodeURIComponent(token.username) + ":" + encodeURIComponent(token.password);
      this.basicToken = Buffer.from(key).toString("base64");
    } else if (typeof token === "object" && "clientId" in token) {
      this.clientId = token.clientId;
      this.clientSecret = token.clientSecret;
    }
  }
  getActiveTokens() {
    if (this.bearerToken) {
      return {
        type: "oauth2",
        bearerToken: this.bearerToken
      };
    } else if (this.basicToken) {
      return {
        type: "basic",
        token: this.basicToken
      };
    } else if (this.consumerSecret && this._oauth) {
      return {
        type: "oauth-1.0a",
        appKey: this.consumerToken,
        appSecret: this.consumerSecret,
        accessToken: this.accessToken,
        accessSecret: this.accessSecret
      };
    } else if (this.clientId) {
      return {
        type: "oauth2-user",
        clientId: this.clientId
      };
    }
    return { type: "none" };
  }
  buildOAuth() {
    if (!this.consumerSecret || !this.consumerToken)
      throw new Error("Invalid consumer tokens");
    return new oauth1_helper_default({
      consumerKeys: { key: this.consumerToken, secret: this.consumerSecret }
    });
  }
  getOAuthAccessTokens() {
    if (!this.accessSecret || !this.accessToken)
      return;
    return {
      key: this.accessToken,
      secret: this.accessSecret
    };
  }
  /* Plugin helpers */
  getPlugins() {
    var _a;
    return (_a = this.clientSettings.plugins) !== null && _a !== void 0 ? _a : [];
  }
  hasPlugins() {
    var _a;
    return !!((_a = this.clientSettings.plugins) === null || _a === void 0 ? void 0 : _a.length);
  }
  async applyPluginMethod(method, args) {
    var _a;
    let returnValue;
    for (const plugin of this.getPlugins()) {
      const value = await ((_a = plugin[method]) === null || _a === void 0 ? void 0 : _a.call(plugin, args));
      if (value && value instanceof TwitterApiPluginResponseOverride) {
        returnValue = value;
      }
    }
    return returnValue;
  }
  /* Request helpers */
  writeAuthHeaders({ headers, bodyInSignature, url, method, query, body }) {
    headers = { ...headers };
    if (this.bearerToken) {
      headers.Authorization = "Bearer " + this.bearerToken;
    } else if (this.basicToken) {
      headers.Authorization = "Basic " + this.basicToken;
    } else if (this.clientId && this.clientSecret) {
      headers.Authorization = "Basic " + OAuth2Helper.getAuthHeader(this.clientId, this.clientSecret);
    } else if (this.consumerSecret && this._oauth) {
      const data = bodyInSignature ? request_param_helper_default.mergeQueryAndBodyForOAuth(query, body) : query;
      const auth2 = this._oauth.authorize({
        url: url.toString(),
        method,
        data
      }, this.getOAuthAccessTokens());
      headers = { ...headers, ...this._oauth.toHeader(auth2) };
    }
    return headers;
  }
  getUrlObjectFromUrlString(url) {
    if (!url.startsWith("http")) {
      url = "https://" + url;
    }
    return new URL(url);
  }
  getHttpRequestArgs({ url: stringUrl, method, query: rawQuery = {}, body: rawBody = {}, headers, forceBodyMode, enableAuth, params }) {
    let body = void 0;
    method = method.toUpperCase();
    headers = headers !== null && headers !== void 0 ? headers : {};
    if (!headers["x-user-agent"]) {
      headers["x-user-agent"] = "Node.twitter-api-v2";
    }
    const url = this.getUrlObjectFromUrlString(stringUrl);
    const rawUrl = url.origin + url.pathname;
    if (params) {
      request_param_helper_default.applyRequestParametersToUrl(url, params);
    }
    const query = request_param_helper_default.formatQueryToString(rawQuery);
    request_param_helper_default.moveUrlQueryParamsIntoObject(url, query);
    if (!(rawBody instanceof Buffer)) {
      trimUndefinedProperties(rawBody);
    }
    const bodyType = forceBodyMode !== null && forceBodyMode !== void 0 ? forceBodyMode : request_param_helper_default.autoDetectBodyType(url);
    if (enableAuth !== false) {
      const bodyInSignature = _ClientRequestMaker.BODY_METHODS.has(method) && bodyType === "url";
      headers = this.writeAuthHeaders({ headers, bodyInSignature, method, query, url, body: rawBody });
    }
    if (_ClientRequestMaker.BODY_METHODS.has(method)) {
      body = request_param_helper_default.constructBodyParams(rawBody, headers, bodyType) || void 0;
    }
    request_param_helper_default.addQueryParamsToUrl(url, query);
    return {
      rawUrl,
      url,
      method,
      headers,
      body
    };
  }
  /* Plugin helpers */
  async applyPreRequestConfigHooks(requestParams) {
    var _a;
    const url = this.getUrlObjectFromUrlString(requestParams.url);
    for (const plugin of this.getPlugins()) {
      const result = await ((_a = plugin.onBeforeRequestConfig) === null || _a === void 0 ? void 0 : _a.call(plugin, {
        client: this,
        url,
        params: requestParams
      }));
      if (result) {
        return result;
      }
    }
  }
  applyPreStreamRequestConfigHooks(requestParams) {
    var _a;
    const url = this.getUrlObjectFromUrlString(requestParams.url);
    for (const plugin of this.getPlugins()) {
      (_a = plugin.onBeforeStreamRequestConfig) === null || _a === void 0 ? void 0 : _a.call(plugin, {
        client: this,
        url,
        params: requestParams
      });
    }
  }
  async applyPreRequestHooks(requestParams, computedParams, requestOptions) {
    await this.applyPluginMethod("onBeforeRequest", {
      client: this,
      url: this.getUrlObjectFromUrlString(requestParams.url),
      params: requestParams,
      computedParams,
      requestOptions
    });
  }
  async applyPostRequestHooks(requestParams, computedParams, requestOptions, response) {
    return await this.applyPluginMethod("onAfterRequest", {
      client: this,
      url: this.getUrlObjectFromUrlString(requestParams.url),
      params: requestParams,
      computedParams,
      requestOptions,
      response
    });
  }
  applyResponseErrorHooks(requestParams, computedParams, requestOptions, promise) {
    return promise.catch(applyResponseHooks.bind(this, requestParams, computedParams, requestOptions));
  }
};
ClientRequestMaker.BODY_METHODS = /* @__PURE__ */ new Set(["POST", "PUT", "PATCH"]);

// node_modules/twitter-api-v2/dist/esm/client.base.js
var TwitterApiBase = class _TwitterApiBase {
  constructor(token, settings = {}) {
    this._currentUser = null;
    this._currentUserV2 = null;
    if (token instanceof _TwitterApiBase) {
      this._requestMaker = token._requestMaker;
    } else {
      this._requestMaker = new ClientRequestMaker(settings);
      this._requestMaker.initializeToken(token);
    }
  }
  /* Prefix/Token handling */
  setPrefix(prefix) {
    this._prefix = prefix;
  }
  cloneWithPrefix(prefix) {
    const clone = this.constructor(this);
    clone.setPrefix(prefix);
    return clone;
  }
  getActiveTokens() {
    return this._requestMaker.getActiveTokens();
  }
  /* Rate limit cache / Plugins */
  getPlugins() {
    return this._requestMaker.getPlugins();
  }
  getPluginOfType(type) {
    return this.getPlugins().find((plugin) => plugin instanceof type);
  }
  /**
   * @deprecated - Migrate to plugin `@twitter-api-v2/plugin-rate-limit`
   *
   * Tells if you hit the Twitter rate limit for {endpoint}.
   * (local data only, this should not ask anything to Twitter)
   */
  hasHitRateLimit(endpoint2) {
    var _a;
    if (this.isRateLimitStatusObsolete(endpoint2)) {
      return false;
    }
    return ((_a = this.getLastRateLimitStatus(endpoint2)) === null || _a === void 0 ? void 0 : _a.remaining) === 0;
  }
  /**
   * @deprecated - Migrate to plugin `@twitter-api-v2/plugin-rate-limit`
   *
   * Tells if you hit the returned Twitter rate limit for {endpoint} has expired.
   * If client has no saved rate limit data for {endpoint}, this will gives you `true`.
   */
  isRateLimitStatusObsolete(endpoint2) {
    const rateLimit = this.getLastRateLimitStatus(endpoint2);
    if (rateLimit === void 0) {
      return true;
    }
    return rateLimit.reset * 1e3 < Date.now();
  }
  /**
   * @deprecated - Migrate to plugin `@twitter-api-v2/plugin-rate-limit`
   *
   * Get the last obtained Twitter rate limit information for {endpoint}.
   * (local data only, this should not ask anything to Twitter)
   */
  getLastRateLimitStatus(endpoint2) {
    const endpointWithPrefix = endpoint2.match(/^https?:\/\//) ? endpoint2 : this._prefix + endpoint2;
    return this._requestMaker.getRateLimits()[endpointWithPrefix];
  }
  /* Current user cache */
  /** Get cached current user. */
  getCurrentUserObject(forceFetch = false) {
    if (!forceFetch && this._currentUser) {
      if (this._currentUser.value) {
        return Promise.resolve(this._currentUser.value);
      }
      return this._currentUser.promise;
    }
    this._currentUser = sharedPromise(() => this.get("account/verify_credentials.json", { tweet_mode: "extended" }, { prefix: API_V1_1_PREFIX }));
    return this._currentUser.promise;
  }
  /**
   * Get cached current user from v2 API.
   * This can only be the slimest available `UserV2` object, with only `id`, `name` and `username` properties defined.
   *
   * To get a customized `UserV2Result`, use `.v2.me()`
   *
   * OAuth2 scopes: `tweet.read` & `users.read`
   */
  getCurrentUserV2Object(forceFetch = false) {
    if (!forceFetch && this._currentUserV2) {
      if (this._currentUserV2.value) {
        return Promise.resolve(this._currentUserV2.value);
      }
      return this._currentUserV2.promise;
    }
    this._currentUserV2 = sharedPromise(() => this.get("users/me", void 0, { prefix: API_V2_PREFIX }));
    return this._currentUserV2.promise;
  }
  async get(url, query = {}, { fullResponse, prefix = this._prefix, ...rest } = {}) {
    if (prefix)
      url = prefix + url;
    const resp = await this._requestMaker.send({
      url,
      method: "GET",
      query,
      ...rest
    });
    return fullResponse ? resp : resp.data;
  }
  async delete(url, query = {}, { fullResponse, prefix = this._prefix, ...rest } = {}) {
    if (prefix)
      url = prefix + url;
    const resp = await this._requestMaker.send({
      url,
      method: "DELETE",
      query,
      ...rest
    });
    return fullResponse ? resp : resp.data;
  }
  async post(url, body, { fullResponse, prefix = this._prefix, ...rest } = {}) {
    if (prefix)
      url = prefix + url;
    const resp = await this._requestMaker.send({
      url,
      method: "POST",
      body,
      ...rest
    });
    return fullResponse ? resp : resp.data;
  }
  async put(url, body, { fullResponse, prefix = this._prefix, ...rest } = {}) {
    if (prefix)
      url = prefix + url;
    const resp = await this._requestMaker.send({
      url,
      method: "PUT",
      body,
      ...rest
    });
    return fullResponse ? resp : resp.data;
  }
  async patch(url, body, { fullResponse, prefix = this._prefix, ...rest } = {}) {
    if (prefix)
      url = prefix + url;
    const resp = await this._requestMaker.send({
      url,
      method: "PATCH",
      body,
      ...rest
    });
    return fullResponse ? resp : resp.data;
  }
  getStream(url, query, { prefix = this._prefix, ...rest } = {}) {
    return this._requestMaker.sendStream({
      url: prefix ? prefix + url : url,
      method: "GET",
      query,
      ...rest
    });
  }
  postStream(url, body, { prefix = this._prefix, ...rest } = {}) {
    return this._requestMaker.sendStream({
      url: prefix ? prefix + url : url,
      method: "POST",
      body,
      ...rest
    });
  }
};

// node_modules/twitter-api-v2/dist/esm/client.subclient.js
var TwitterApiSubClient = class extends TwitterApiBase {
  constructor(instance) {
    if (!(instance instanceof TwitterApiBase)) {
      throw new Error("You must instance SubTwitterApi instance from existing TwitterApi instance.");
    }
    super(instance);
  }
};

// node_modules/twitter-api-v2/dist/esm/paginators/tweet.paginator.v1.js
var TweetTimelineV1Paginator = class extends TwitterPaginator_default {
  constructor() {
    super(...arguments);
    this.hasFinishedFetch = false;
  }
  refreshInstanceFromResult(response, isNextPage) {
    const result = response.data;
    this._rateLimit = response.rateLimit;
    if (isNextPage) {
      this._realData.push(...result);
      this.hasFinishedFetch = result.length === 0;
    }
  }
  getNextQueryParams(maxResults) {
    const latestId = BigInt(this._realData[this._realData.length - 1].id_str);
    return {
      ...this.injectQueryParams(maxResults),
      max_id: (latestId - BigInt(1)).toString()
    };
  }
  getPageLengthFromRequest(result) {
    return result.data.length;
  }
  isFetchLastOver(result) {
    return !result.data.length;
  }
  canFetchNextPage(result) {
    return result.length > 0;
  }
  getItemArray() {
    return this.tweets;
  }
  /**
   * Tweets returned by paginator.
   */
  get tweets() {
    return this._realData;
  }
  get done() {
    return super.done || this.hasFinishedFetch;
  }
};
var HomeTimelineV1Paginator = class extends TweetTimelineV1Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "statuses/home_timeline.json";
  }
};
var MentionTimelineV1Paginator = class extends TweetTimelineV1Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "statuses/mentions_timeline.json";
  }
};
var UserTimelineV1Paginator = class extends TweetTimelineV1Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "statuses/user_timeline.json";
  }
};
var ListTimelineV1Paginator = class extends TweetTimelineV1Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "lists/statuses.json";
  }
};
var UserFavoritesV1Paginator = class extends TweetTimelineV1Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "favorites/list.json";
  }
};

// node_modules/twitter-api-v2/dist/esm/paginators/mutes.paginator.v1.js
var MuteUserListV1Paginator = class extends CursoredV1Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "mutes/users/list.json";
  }
  refreshInstanceFromResult(response, isNextPage) {
    const result = response.data;
    this._rateLimit = response.rateLimit;
    if (isNextPage) {
      this._realData.users.push(...result.users);
      this._realData.next_cursor = result.next_cursor;
    }
  }
  getPageLengthFromRequest(result) {
    return result.data.users.length;
  }
  getItemArray() {
    return this.users;
  }
  /**
   * Users returned by paginator.
   */
  get users() {
    return this._realData.users;
  }
};
var MuteUserIdsV1Paginator = class extends CursoredV1Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "mutes/users/ids.json";
    this._maxResultsWhenFetchLast = 5e3;
  }
  refreshInstanceFromResult(response, isNextPage) {
    const result = response.data;
    this._rateLimit = response.rateLimit;
    if (isNextPage) {
      this._realData.ids.push(...result.ids);
      this._realData.next_cursor = result.next_cursor;
    }
  }
  getPageLengthFromRequest(result) {
    return result.data.ids.length;
  }
  getItemArray() {
    return this.ids;
  }
  /**
   * Users IDs returned by paginator.
   */
  get ids() {
    return this._realData.ids;
  }
};

// node_modules/twitter-api-v2/dist/esm/paginators/followers.paginator.v1.js
var UserFollowerListV1Paginator = class extends CursoredV1Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "followers/list.json";
  }
  refreshInstanceFromResult(response, isNextPage) {
    const result = response.data;
    this._rateLimit = response.rateLimit;
    if (isNextPage) {
      this._realData.users.push(...result.users);
      this._realData.next_cursor = result.next_cursor;
    }
  }
  getPageLengthFromRequest(result) {
    return result.data.users.length;
  }
  getItemArray() {
    return this.users;
  }
  /**
   * Users returned by paginator.
   */
  get users() {
    return this._realData.users;
  }
};
var UserFollowerIdsV1Paginator = class extends CursoredV1Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "followers/ids.json";
    this._maxResultsWhenFetchLast = 5e3;
  }
  refreshInstanceFromResult(response, isNextPage) {
    const result = response.data;
    this._rateLimit = response.rateLimit;
    if (isNextPage) {
      this._realData.ids.push(...result.ids);
      this._realData.next_cursor = result.next_cursor;
    }
  }
  getPageLengthFromRequest(result) {
    return result.data.ids.length;
  }
  getItemArray() {
    return this.ids;
  }
  /**
   * Users IDs returned by paginator.
   */
  get ids() {
    return this._realData.ids;
  }
};

// node_modules/twitter-api-v2/dist/esm/paginators/friends.paginator.v1.js
var UserFriendListV1Paginator = class extends CursoredV1Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "friends/list.json";
  }
  refreshInstanceFromResult(response, isNextPage) {
    const result = response.data;
    this._rateLimit = response.rateLimit;
    if (isNextPage) {
      this._realData.users.push(...result.users);
      this._realData.next_cursor = result.next_cursor;
    }
  }
  getPageLengthFromRequest(result) {
    return result.data.users.length;
  }
  getItemArray() {
    return this.users;
  }
  /**
   * Users returned by paginator.
   */
  get users() {
    return this._realData.users;
  }
};
var UserFollowersIdsV1Paginator = class extends CursoredV1Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "friends/ids.json";
    this._maxResultsWhenFetchLast = 5e3;
  }
  refreshInstanceFromResult(response, isNextPage) {
    const result = response.data;
    this._rateLimit = response.rateLimit;
    if (isNextPage) {
      this._realData.ids.push(...result.ids);
      this._realData.next_cursor = result.next_cursor;
    }
  }
  getPageLengthFromRequest(result) {
    return result.data.ids.length;
  }
  getItemArray() {
    return this.ids;
  }
  /**
   * Users IDs returned by paginator.
   */
  get ids() {
    return this._realData.ids;
  }
};

// node_modules/twitter-api-v2/dist/esm/paginators/user.paginator.v1.js
var UserSearchV1Paginator = class extends TwitterPaginator_default {
  constructor() {
    super(...arguments);
    this._endpoint = "users/search.json";
  }
  refreshInstanceFromResult(response, isNextPage) {
    const result = response.data;
    this._rateLimit = response.rateLimit;
    if (isNextPage) {
      this._realData.push(...result);
    }
  }
  getNextQueryParams(maxResults) {
    var _a;
    const previousPage = Number((_a = this._queryParams.page) !== null && _a !== void 0 ? _a : "1");
    return {
      ...this._queryParams,
      page: previousPage + 1,
      ...maxResults ? { count: maxResults } : {}
    };
  }
  getPageLengthFromRequest(result) {
    return result.data.length;
  }
  isFetchLastOver(result) {
    return !result.data.length;
  }
  canFetchNextPage(result) {
    return result.length > 0;
  }
  getItemArray() {
    return this.users;
  }
  /**
   * Users returned by paginator.
   */
  get users() {
    return this._realData;
  }
};
var FriendshipsIncomingV1Paginator = class extends CursoredV1Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "friendships/incoming.json";
    this._maxResultsWhenFetchLast = 5e3;
  }
  refreshInstanceFromResult(response, isNextPage) {
    const result = response.data;
    this._rateLimit = response.rateLimit;
    if (isNextPage) {
      this._realData.ids.push(...result.ids);
      this._realData.next_cursor = result.next_cursor;
    }
  }
  getPageLengthFromRequest(result) {
    return result.data.ids.length;
  }
  getItemArray() {
    return this.ids;
  }
  /**
   * Users IDs returned by paginator.
   */
  get ids() {
    return this._realData.ids;
  }
};
var FriendshipsOutgoingV1Paginator = class extends FriendshipsIncomingV1Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "friendships/outgoing.json";
  }
};

// node_modules/twitter-api-v2/dist/esm/paginators/list.paginator.v1.js
var ListListsV1Paginator = class extends CursoredV1Paginator {
  refreshInstanceFromResult(response, isNextPage) {
    const result = response.data;
    this._rateLimit = response.rateLimit;
    if (isNextPage) {
      this._realData.lists.push(...result.lists);
      this._realData.next_cursor = result.next_cursor;
    }
  }
  getPageLengthFromRequest(result) {
    return result.data.lists.length;
  }
  getItemArray() {
    return this.lists;
  }
  /**
   * Lists returned by paginator.
   */
  get lists() {
    return this._realData.lists;
  }
};
var ListMembershipsV1Paginator = class extends ListListsV1Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "lists/memberships.json";
  }
};
var ListOwnershipsV1Paginator = class extends ListListsV1Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "lists/ownerships.json";
  }
};
var ListSubscriptionsV1Paginator = class extends ListListsV1Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "lists/subscriptions.json";
  }
};
var ListUsersV1Paginator = class extends CursoredV1Paginator {
  refreshInstanceFromResult(response, isNextPage) {
    const result = response.data;
    this._rateLimit = response.rateLimit;
    if (isNextPage) {
      this._realData.users.push(...result.users);
      this._realData.next_cursor = result.next_cursor;
    }
  }
  getPageLengthFromRequest(result) {
    return result.data.users.length;
  }
  getItemArray() {
    return this.users;
  }
  /**
   * Users returned by paginator.
   */
  get users() {
    return this._realData.users;
  }
};
var ListMembersV1Paginator = class extends ListUsersV1Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "lists/members.json";
  }
};
var ListSubscribersV1Paginator = class extends ListUsersV1Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "lists/subscribers.json";
  }
};

// node_modules/twitter-api-v2/dist/esm/v1/client.v1.read.js
var TwitterApiv1ReadOnly = class extends TwitterApiSubClient {
  constructor() {
    super(...arguments);
    this._prefix = API_V1_1_PREFIX;
  }
  /* Tweets */
  /**
   * Returns a single Tweet, specified by the id parameter. The Tweet's author will also be embedded within the Tweet.
   * https://developer.x.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/get-statuses-show-id
   */
  singleTweet(tweetId, options = {}) {
    return this.get("statuses/show.json", { tweet_mode: "extended", id: tweetId, ...options });
  }
  tweets(ids, options = {}) {
    return this.post("statuses/lookup.json", { tweet_mode: "extended", id: ids, ...options });
  }
  /**
   * Returns a single Tweet, specified by either a Tweet web URL or the Tweet ID, in an oEmbed-compatible format.
   * The returned HTML snippet will be automatically recognized as an Embedded Tweet when Twitter's widget JavaScript is included on the page.
   * https://developer.x.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/get-statuses-oembed
   */
  oembedTweet(tweetId, options = {}) {
    return this.get("oembed", {
      url: `https://x.com/i/statuses/${tweetId}`,
      ...options
    }, { prefix: "https://publish.x.com/" });
  }
  /* Tweets timelines */
  /**
   * Returns a collection of the most recent Tweets and Retweets posted by the authenticating user and the users they follow.
   * The home timeline is central to how most users interact with the Twitter service.
   * https://developer.x.com/en/docs/twitter-api/v1/tweets/timelines/api-reference/get-statuses-home_timeline
   */
  async homeTimeline(options = {}) {
    const queryParams = {
      tweet_mode: "extended",
      ...options
    };
    const initialRq = await this.get("statuses/home_timeline.json", queryParams, { fullResponse: true });
    return new HomeTimelineV1Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams
    });
  }
  /**
   * Returns the 20 most recent mentions (Tweets containing a users's @screen_name) for the authenticating user.
   * The timeline returned is the equivalent of the one seen when you view your mentions on x.com.
   * https://developer.x.com/en/docs/twitter-api/v1/tweets/timelines/api-reference/get-statuses-mentions_timeline
   */
  async mentionTimeline(options = {}) {
    const queryParams = {
      tweet_mode: "extended",
      ...options
    };
    const initialRq = await this.get("statuses/mentions_timeline.json", queryParams, { fullResponse: true });
    return new MentionTimelineV1Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams
    });
  }
  /**
   * Returns a collection of the most recent Tweets posted by the user indicated by the user_id parameters.
   * User timelines belonging to protected users may only be requested when the authenticated user either "owns" the timeline or is an approved follower of the owner.
   * https://developer.x.com/en/docs/twitter-api/v1/tweets/timelines/api-reference/get-statuses-user_timeline
   */
  async userTimeline(userId, options = {}) {
    const queryParams = {
      tweet_mode: "extended",
      user_id: userId,
      ...options
    };
    const initialRq = await this.get("statuses/user_timeline.json", queryParams, { fullResponse: true });
    return new UserTimelineV1Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams
    });
  }
  /**
   * Returns a collection of the most recent Tweets posted by the user indicated by the screen_name parameters.
   * User timelines belonging to protected users may only be requested when the authenticated user either "owns" the timeline or is an approved follower of the owner.
   * https://developer.x.com/en/docs/twitter-api/v1/tweets/timelines/api-reference/get-statuses-user_timeline
   */
  async userTimelineByUsername(username, options = {}) {
    const queryParams = {
      tweet_mode: "extended",
      screen_name: username,
      ...options
    };
    const initialRq = await this.get("statuses/user_timeline.json", queryParams, { fullResponse: true });
    return new UserTimelineV1Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams
    });
  }
  /**
   * Returns the most recent Tweets liked by the authenticating or specified user, 20 tweets by default.
   * Note: favorites are now known as likes.
   * https://developer.x.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/get-favorites-list
   */
  async favoriteTimeline(userId, options = {}) {
    const queryParams = {
      tweet_mode: "extended",
      user_id: userId,
      ...options
    };
    const initialRq = await this.get("favorites/list.json", queryParams, { fullResponse: true });
    return new UserFavoritesV1Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams
    });
  }
  /**
   * Returns the most recent Tweets liked by the authenticating or specified user, 20 tweets by default.
   * Note: favorites are now known as likes.
   * https://developer.x.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/get-favorites-list
   */
  async favoriteTimelineByUsername(username, options = {}) {
    const queryParams = {
      tweet_mode: "extended",
      screen_name: username,
      ...options
    };
    const initialRq = await this.get("favorites/list.json", queryParams, { fullResponse: true });
    return new UserFavoritesV1Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams
    });
  }
  /* Users */
  /**
   * Returns a variety of information about the user specified by the required user_id or screen_name parameter.
   * The author's most recent Tweet will be returned inline when possible.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-users-show
   */
  user(user) {
    return this.get("users/show.json", { tweet_mode: "extended", ...user });
  }
  /**
   * Returns fully-hydrated user objects for up to 100 users per request,
   * as specified by comma-separated values passed to the user_id and/or screen_name parameters.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-users-lookup
   */
  users(query) {
    return this.get("users/lookup.json", { tweet_mode: "extended", ...query });
  }
  /**
   * Returns an HTTP 200 OK response code and a representation of the requesting user if authentication was successful;
   * returns a 401 status code and an error message if not.
   * Use this method to test if supplied user credentials are valid.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/manage-account-settings/api-reference/get-account-verify_credentials
   */
  verifyCredentials(options = {}) {
    return this.get("account/verify_credentials.json", options);
  }
  /**
   * Returns an array of user objects the authenticating user has muted.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/mute-block-report-users/api-reference/get-mutes-users-list
   */
  async listMutedUsers(options = {}) {
    const queryParams = {
      tweet_mode: "extended",
      ...options
    };
    const initialRq = await this.get("mutes/users/list.json", queryParams, { fullResponse: true });
    return new MuteUserListV1Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams
    });
  }
  /**
   * Returns an array of numeric user ids the authenticating user has muted.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/mute-block-report-users/api-reference/get-mutes-users-ids
   */
  async listMutedUserIds(options = {}) {
    const queryParams = {
      stringify_ids: true,
      ...options
    };
    const initialRq = await this.get("mutes/users/ids.json", queryParams, { fullResponse: true });
    return new MuteUserIdsV1Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams
    });
  }
  /**
   * Returns an array of user objects of friends of the specified user.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-friends-list
   */
  async userFriendList(options = {}) {
    const queryParams = {
      ...options
    };
    const initialRq = await this.get("friends/list.json", queryParams, { fullResponse: true });
    return new UserFriendListV1Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams
    });
  }
  /**
   * Returns an array of user objects of followers of the specified user.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-followers-list
   */
  async userFollowerList(options = {}) {
    const queryParams = {
      ...options
    };
    const initialRq = await this.get("followers/list.json", queryParams, { fullResponse: true });
    return new UserFollowerListV1Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams
    });
  }
  /**
   * Returns an array of numeric user ids of followers of the specified user.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-followers-ids
   */
  async userFollowerIds(options = {}) {
    const queryParams = {
      stringify_ids: true,
      ...options
    };
    const initialRq = await this.get("followers/ids.json", queryParams, { fullResponse: true });
    return new UserFollowerIdsV1Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams
    });
  }
  /**
   * Returns an array of numeric user ids of friends of the specified user.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-friends-ids
   */
  async userFollowingIds(options = {}) {
    const queryParams = {
      stringify_ids: true,
      ...options
    };
    const initialRq = await this.get("friends/ids.json", queryParams, { fullResponse: true });
    return new UserFollowersIdsV1Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams
    });
  }
  /**
   * Provides a simple, relevance-based search interface to public user accounts on Twitter.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-users-search
   */
  async searchUsers(query, options = {}) {
    const queryParams = {
      q: query,
      tweet_mode: "extended",
      page: 1,
      ...options
    };
    const initialRq = await this.get("users/search.json", queryParams, { fullResponse: true });
    return new UserSearchV1Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams
    });
  }
  /* Friendship API */
  /**
   * Returns detailed information about the relationship between two arbitrary users.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-friendships-show
   */
  friendship(sources) {
    return this.get("friendships/show.json", sources);
  }
  /**
   * Returns the relationships of the authenticating user to the comma-separated list of up to 100 screen_names or user_ids provided.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-friendships-lookup
   */
  friendships(friendships) {
    return this.get("friendships/lookup.json", friendships);
  }
  /**
   * Returns a collection of user_ids that the currently authenticated user does not want to receive retweets from.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-friendships-no_retweets-ids
   */
  friendshipsNoRetweets() {
    return this.get("friendships/no_retweets/ids.json", { stringify_ids: true });
  }
  /**
   * Returns a collection of numeric IDs for every user who has a pending request to follow the authenticating user.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-friendships-incoming
   */
  async friendshipsIncoming(options = {}) {
    const queryParams = {
      stringify_ids: true,
      ...options
    };
    const initialRq = await this.get("friendships/incoming.json", queryParams, { fullResponse: true });
    return new FriendshipsIncomingV1Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams
    });
  }
  /**
   * Returns a collection of numeric IDs for every protected user for whom the authenticating user has a pending follow request.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-friendships-outgoing
   */
  async friendshipsOutgoing(options = {}) {
    const queryParams = {
      stringify_ids: true,
      ...options
    };
    const initialRq = await this.get("friendships/outgoing.json", queryParams, { fullResponse: true });
    return new FriendshipsOutgoingV1Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams
    });
  }
  /* Account/user API */
  /**
   * Get current account settings for authenticating user.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/manage-account-settings/api-reference/get-account-settings
   */
  accountSettings() {
    return this.get("account/settings.json");
  }
  /**
   * Returns a map of the available size variations of the specified user's profile banner.
   * If the user has not uploaded a profile banner, a HTTP 404 will be served instead.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/manage-account-settings/api-reference/get-users-profile_banner
   */
  userProfileBannerSizes(params) {
    return this.get("users/profile_banner.json", params);
  }
  /* Lists */
  /**
   * Returns the specified list. Private lists will only be shown if the authenticated user owns the specified list.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/get-lists-show
   */
  list(options) {
    return this.get("lists/show.json", { tweet_mode: "extended", ...options });
  }
  /**
   * Returns all lists the authenticating or specified user subscribes to, including their own.
   * If no user is given, the authenticating user is used.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/get-lists-list
   */
  lists(options = {}) {
    return this.get("lists/list.json", { tweet_mode: "extended", ...options });
  }
  /**
   * Returns the members of the specified list. Private list members will only be shown if the authenticated user owns the specified list.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/get-lists-members
   */
  async listMembers(options = {}) {
    const queryParams = {
      tweet_mode: "extended",
      ...options
    };
    const initialRq = await this.get("lists/members.json", queryParams, { fullResponse: true });
    return new ListMembersV1Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams
    });
  }
  /**
   * Check if the specified user is a member of the specified list.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/get-lists-members-show
   */
  listGetMember(options) {
    return this.get("lists/members/show.json", { tweet_mode: "extended", ...options });
  }
  /**
   * Returns the lists the specified user has been added to.
   * If user_id or screen_name are not provided, the memberships for the authenticating user are returned.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/get-lists-memberships
   */
  async listMemberships(options = {}) {
    const queryParams = {
      tweet_mode: "extended",
      ...options
    };
    const initialRq = await this.get("lists/memberships.json", queryParams, { fullResponse: true });
    return new ListMembershipsV1Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams
    });
  }
  /**
   * Returns the lists owned by the specified Twitter user. Private lists will only be shown if the authenticated user is also the owner of the lists.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/get-lists-ownerships
   */
  async listOwnerships(options = {}) {
    const queryParams = {
      tweet_mode: "extended",
      ...options
    };
    const initialRq = await this.get("lists/ownerships.json", queryParams, { fullResponse: true });
    return new ListOwnershipsV1Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams
    });
  }
  /**
   * Returns a timeline of tweets authored by members of the specified list. Retweets are included by default.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/get-lists-statuses
   */
  async listStatuses(options) {
    const queryParams = {
      tweet_mode: "extended",
      ...options
    };
    const initialRq = await this.get("lists/statuses.json", queryParams, { fullResponse: true });
    return new ListTimelineV1Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams
    });
  }
  /**
   * Returns the subscribers of the specified list. Private list subscribers will only be shown if the authenticated user owns the specified list.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/get-lists-subscribers
   */
  async listSubscribers(options = {}) {
    const queryParams = {
      tweet_mode: "extended",
      ...options
    };
    const initialRq = await this.get("lists/subscribers.json", queryParams, { fullResponse: true });
    return new ListSubscribersV1Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams
    });
  }
  /**
   * Check if the specified user is a subscriber of the specified list. Returns the user if they are a subscriber.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/get-lists-subscribers-show
   */
  listGetSubscriber(options) {
    return this.get("lists/subscribers/show.json", { tweet_mode: "extended", ...options });
  }
  /**
   * Obtain a collection of the lists the specified user is subscribed to, 20 lists per page by default.
   * Does not include the user's own lists.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/get-lists-subscriptions
   */
  async listSubscriptions(options = {}) {
    const queryParams = {
      tweet_mode: "extended",
      ...options
    };
    const initialRq = await this.get("lists/subscriptions.json", queryParams, { fullResponse: true });
    return new ListSubscriptionsV1Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams
    });
  }
  /* Media upload API */
  /**
   * The STATUS command (this method) is used to periodically poll for updates of media processing operation.
   * After the STATUS command response returns succeeded, you can move on to the next step which is usually create Tweet with media_id.
   * https://developer.x.com/en/docs/twitter-api/v1/media/upload-media/api-reference/get-media-upload-status
   */
  mediaInfo(mediaId) {
    return this.get("media/upload.json", {
      command: "STATUS",
      media_id: mediaId
    }, { prefix: API_V1_1_UPLOAD_PREFIX });
  }
  filterStream({ autoConnect, ...params } = {}) {
    const parameters = {};
    for (const [key, value] of Object.entries(params)) {
      if (key === "follow" || key === "track") {
        parameters[key] = value.toString();
      } else if (key === "locations") {
        const locations = value;
        parameters.locations = arrayWrap(locations).map((loc) => `${loc.lng},${loc.lat}`).join(",");
      } else {
        parameters[key] = value;
      }
    }
    const streamClient = this.stream;
    return streamClient.postStream("statuses/filter.json", parameters, { autoConnect });
  }
  sampleStream({ autoConnect, ...params } = {}) {
    const streamClient = this.stream;
    return streamClient.getStream("statuses/sample.json", params, { autoConnect });
  }
  /**
   * Create a client that is prefixed with `https//stream.x.com` instead of classic API URL.
   */
  get stream() {
    const copiedClient = new client_v1_default(this);
    copiedClient.setPrefix(API_V1_1_STREAM_PREFIX);
    return copiedClient;
  }
  /* Trends API */
  /**
   * Returns the top 50 trending topics for a specific id, if trending information is available for it.
   * Note: The id parameter for this endpoint is the "where on earth identifier" or WOEID, which is a legacy identifier created by Yahoo and has been deprecated.
   * https://developer.x.com/en/docs/twitter-api/v1/trends/trends-for-location/api-reference/get-trends-place
   */
  trendsByPlace(woeId, options = {}) {
    return this.get("trends/place.json", { id: woeId, ...options });
  }
  /**
   * Returns the locations that Twitter has trending topic information for.
   * The response is an array of "locations" that encode the location's WOEID
   * and some other human-readable information such as a canonical name and country the location belongs in.
   * https://developer.x.com/en/docs/twitter-api/v1/trends/locations-with-trending-topics/api-reference/get-trends-available
   */
  trendsAvailable() {
    return this.get("trends/available.json");
  }
  /**
   * Returns the locations that Twitter has trending topic information for, closest to a specified location.
   * https://developer.x.com/en/docs/twitter-api/v1/trends/locations-with-trending-topics/api-reference/get-trends-closest
   */
  trendsClosest(lat, long) {
    return this.get("trends/closest.json", { lat, long });
  }
  /* Geo API */
  /**
   * Returns all the information about a known place.
   * https://developer.x.com/en/docs/twitter-api/v1/geo/place-information/api-reference/get-geo-id-place_id
   */
  geoPlace(placeId) {
    return this.get("geo/id/:place_id.json", void 0, { params: { place_id: placeId } });
  }
  /**
   * Search for places that can be attached to a Tweet via POST statuses/update.
   * This request will return a list of all the valid places that can be used as the place_id when updating a status.
   * https://developer.x.com/en/docs/twitter-api/v1/geo/places-near-location/api-reference/get-geo-search
   */
  geoSearch(options) {
    return this.get("geo/search.json", options);
  }
  /**
   * Given a latitude and a longitude, searches for up to 20 places that can be used as a place_id when updating a status.
   * This request is an informative call and will deliver generalized results about geography.
   * https://developer.x.com/en/docs/twitter-api/v1/geo/places-near-location/api-reference/get-geo-reverse_geocode
   */
  geoReverseGeoCode(options) {
    return this.get("geo/reverse_geocode.json", options);
  }
  /* Developer utilities */
  /**
   * Returns the current rate limits for methods belonging to the specified resource families.
   * Each API resource belongs to a "resource family" which is indicated in its method documentation.
   * The method's resource family can be determined from the first component of the path after the resource version.
   * https://developer.x.com/en/docs/twitter-api/v1/developer-utilities/rate-limit-status/api-reference/get-application-rate_limit_status
   */
  rateLimitStatuses(...resources) {
    return this.get("application/rate_limit_status.json", { resources });
  }
  /**
   * Returns the list of languages supported by Twitter along with the language code supported by Twitter.
   * https://developer.x.com/en/docs/twitter-api/v1/developer-utilities/supported-languages/api-reference/get-help-languages
   */
  supportedLanguages() {
    return this.get("help/languages.json");
  }
};
async function readFileIntoBuffer(file) {
  const handle = await getFileHandle(file);
  if (typeof handle === "number") {
    return new Promise((resolve, reject) => {
      fs4.readFile(handle, (err, data) => {
        if (err) {
          return reject(err);
        }
        resolve(data);
      });
    });
  } else if (handle instanceof Buffer) {
    return handle;
  } else {
    return handle.readFile();
  }
}
function getFileHandle(file) {
  if (typeof file === "string") {
    return fs4.promises.open(file, "r");
  } else if (typeof file === "number") {
    return file;
  } else if (typeof file === "object" && !(file instanceof Buffer)) {
    return file;
  } else if (!(file instanceof Buffer)) {
    throw new Error("Given file is not valid, please check its type.");
  } else {
    return file;
  }
}
async function getFileSizeFromFileHandle(fileHandle) {
  if (typeof fileHandle === "number") {
    const stats = await new Promise((resolve, reject) => {
      fs4.fstat(fileHandle, (err, stats2) => {
        if (err)
          reject(err);
        resolve(stats2);
      });
    });
    return stats.size;
  } else if (fileHandle instanceof Buffer) {
    return fileHandle.length;
  } else {
    return (await fileHandle.stat()).size;
  }
}
function getMimeType(file, type, mimeType) {
  if (typeof mimeType === "string") {
    return mimeType;
  } else if (typeof file === "string" && !type) {
    return getMimeByName(file);
  } else if (typeof type === "string") {
    return getMimeByType(type);
  }
  throw new Error("You must specify type if file is a file handle or Buffer.");
}
function getMimeByName(name) {
  if (name.endsWith(".jpeg") || name.endsWith(".jpg"))
    return EUploadMimeType.Jpeg;
  if (name.endsWith(".png"))
    return EUploadMimeType.Png;
  if (name.endsWith(".webp"))
    return EUploadMimeType.Webp;
  if (name.endsWith(".gif"))
    return EUploadMimeType.Gif;
  if (name.endsWith(".mpeg4") || name.endsWith(".mp4"))
    return EUploadMimeType.Mp4;
  if (name.endsWith(".mov") || name.endsWith(".mov"))
    return EUploadMimeType.Mov;
  if (name.endsWith(".srt"))
    return EUploadMimeType.Srt;
  safeDeprecationWarning({
    instance: "TwitterApiv1ReadWrite",
    method: "uploadMedia",
    problem: "options.mimeType is missing and filename couldn't help to resolve MIME type, so it will fallback to image/jpeg",
    resolution: "If you except to give filenames without extensions, please specify explicitlty the MIME type using options.mimeType"
  });
  return EUploadMimeType.Jpeg;
}
function getMimeByType(type) {
  safeDeprecationWarning({
    instance: "TwitterApiv1ReadWrite",
    method: "uploadMedia",
    problem: "you're using options.type",
    resolution: "Remove options.type argument and migrate to options.mimeType which takes the real MIME type. If you're using type=longmp4, add options.longVideo alongside of mimeType=EUploadMimeType.Mp4"
  });
  if (type === "gif")
    return EUploadMimeType.Gif;
  if (type === "jpg")
    return EUploadMimeType.Jpeg;
  if (type === "png")
    return EUploadMimeType.Png;
  if (type === "webp")
    return EUploadMimeType.Webp;
  if (type === "srt")
    return EUploadMimeType.Srt;
  if (type === "mp4" || type === "longmp4")
    return EUploadMimeType.Mp4;
  if (type === "mov")
    return EUploadMimeType.Mov;
  return type;
}
function getMediaCategoryByMime(name, target) {
  if (name === EUploadMimeType.Mp4 || name === EUploadMimeType.Mov)
    return target === "tweet" ? "TweetVideo" : "DmVideo";
  if (name === EUploadMimeType.Gif)
    return target === "tweet" ? "TweetGif" : "DmGif";
  if (name === EUploadMimeType.Srt)
    return "Subtitles";
  else
    return target === "tweet" ? "TweetImage" : "DmImage";
}
function sleepSecs(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1e3));
}
async function readNextPartOf(file, chunkLength, bufferOffset = 0, buffer) {
  if (file instanceof Buffer) {
    const rt = file.slice(bufferOffset, bufferOffset + chunkLength);
    return [rt, rt.length];
  }
  if (!buffer) {
    throw new Error("Well, we will need a buffer to store file content.");
  }
  let bytesRead;
  if (typeof file === "number") {
    bytesRead = await new Promise((resolve, reject) => {
      fs4.read(file, buffer, 0, chunkLength, bufferOffset, (err, nread) => {
        if (err)
          reject(err);
        resolve(nread);
      });
    });
  } else {
    const res = await file.read(buffer, 0, chunkLength, bufferOffset);
    bytesRead = res.bytesRead;
  }
  return [buffer, bytesRead];
}

// node_modules/twitter-api-v2/dist/esm/v1/client.v1.write.js
var UPLOAD_ENDPOINT = "media/upload.json";
var TwitterApiv1ReadWrite = class extends TwitterApiv1ReadOnly {
  constructor() {
    super(...arguments);
    this._prefix = API_V1_1_PREFIX;
  }
  /**
   * Get a client with only read rights.
   */
  get readOnly() {
    return this;
  }
  /* Tweet API */
  /**
   * Post a new tweet.
   * https://developer.x.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/post-statuses-update
   */
  tweet(status, payload = {}) {
    const queryParams = {
      status,
      tweet_mode: "extended",
      ...payload
    };
    return this.post("statuses/update.json", queryParams);
  }
  /**
   * Quote an existing tweet.
   * https://developer.x.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/post-statuses-update
   */
  async quote(status, quotingStatusId, payload = {}) {
    const url = "https://x.com/i/statuses/" + quotingStatusId;
    return this.tweet(status, { ...payload, attachment_url: url });
  }
  /**
   * Post a series of tweets.
   * https://developer.x.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/post-statuses-update
   */
  async tweetThread(tweets) {
    const postedTweets = [];
    for (const tweet of tweets) {
      const lastTweet = postedTweets.length ? postedTweets[postedTweets.length - 1] : null;
      const queryParams = { ...typeof tweet === "string" ? { status: tweet } : tweet };
      const inReplyToId = lastTweet ? lastTweet.id_str : queryParams.in_reply_to_status_id;
      const status = queryParams.status;
      if (inReplyToId) {
        postedTweets.push(await this.reply(status, inReplyToId, queryParams));
      } else {
        postedTweets.push(await this.tweet(status, queryParams));
      }
    }
    return postedTweets;
  }
  /**
   * Reply to an existing tweet. Shortcut to `.tweet` with tweaked parameters.
   * https://developer.x.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/post-statuses-update
   */
  reply(status, in_reply_to_status_id, payload = {}) {
    return this.tweet(status, {
      auto_populate_reply_metadata: true,
      in_reply_to_status_id,
      ...payload
    });
  }
  /**
   * Delete an existing tweet belonging to you.
   * https://developer.x.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/post-statuses-destroy-id
   */
  deleteTweet(tweetId) {
    return this.post("statuses/destroy/:id.json", { tweet_mode: "extended" }, { params: { id: tweetId } });
  }
  /* User API */
  /**
   * Report the specified user as a spam account to Twitter.
   * Additionally, optionally performs the equivalent of POST blocks/create on behalf of the authenticated user.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/mute-block-report-users/api-reference/post-users-report_spam
   */
  reportUserAsSpam(options) {
    return this.post("users/report_spam.json", { tweet_mode: "extended", ...options });
  }
  /**
   * Turn on/off Retweets and device notifications from the specified user.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/post-friendships-update
   */
  updateFriendship(options) {
    return this.post("friendships/update.json", options);
  }
  /**
   * Follow the specified user.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/post-friendships-create
   */
  createFriendship(options) {
    return this.post("friendships/create.json", options);
  }
  /**
   * Unfollow the specified user.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/post-friendships-destroy
   */
  destroyFriendship(options) {
    return this.post("friendships/destroy.json", options);
  }
  /* Account API */
  /**
   * Update current account settings for authenticating user.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/manage-account-settings/api-reference/get-account-settings
   */
  updateAccountSettings(options) {
    return this.post("account/settings.json", options);
  }
  /**
   * Sets some values that users are able to set under the "Account" tab of their settings page.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/manage-account-settings/api-reference/post-account-update_profile
   */
  updateAccountProfile(options) {
    return this.post("account/update_profile.json", options);
  }
  /**
   * Uploads a profile banner on behalf of the authenticating user.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/manage-account-settings/api-reference/post-account-update_profile_banner
   */
  async updateAccountProfileBanner(file, options = {}) {
    const queryParams = {
      banner: await readFileIntoBuffer(file),
      ...options
    };
    return this.post("account/update_profile_banner.json", queryParams, { forceBodyMode: "form-data" });
  }
  /**
   * Updates the authenticating user's profile image.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/manage-account-settings/api-reference/post-account-update_profile_image
   */
  async updateAccountProfileImage(file, options = {}) {
    const queryParams = {
      tweet_mode: "extended",
      image: await readFileIntoBuffer(file),
      ...options
    };
    return this.post("account/update_profile_image.json", queryParams, { forceBodyMode: "form-data" });
  }
  /**
   * Removes the uploaded profile banner for the authenticating user.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/manage-account-settings/api-reference/post-account-remove_profile_banner
   */
  removeAccountProfileBanner() {
    return this.post("account/remove_profile_banner.json");
  }
  /* Lists */
  /**
   * Creates a new list for the authenticated user.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/post-lists-create
   */
  createList(options) {
    return this.post("lists/create.json", { tweet_mode: "extended", ...options });
  }
  /**
   * Updates the specified list. The authenticated user must own the list to be able to update it.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/post-lists-update
   */
  updateList(options) {
    return this.post("lists/update.json", { tweet_mode: "extended", ...options });
  }
  /**
   * Deletes the specified list. The authenticated user must own the list to be able to destroy it.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/post-lists-destroy
   */
  removeList(options) {
    return this.post("lists/destroy.json", { tweet_mode: "extended", ...options });
  }
  /**
   * Adds multiple members to a list, by specifying a comma-separated list of member ids or screen names.
   * If you add a single `user_id` or `screen_name`, it will target `lists/members/create.json`, otherwise
   * it will target `lists/members/create_all.json`.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/post-lists-members-create_all
   */
  addListMembers(options) {
    const hasMultiple = options.user_id && hasMultipleItems(options.user_id) || options.screen_name && hasMultipleItems(options.screen_name);
    const endpoint2 = hasMultiple ? "lists/members/create_all.json" : "lists/members/create.json";
    return this.post(endpoint2, options);
  }
  /**
   * Removes one or more members from a list, by specifying a comma-separated list of member ids or screen names.
   * If you add a single `user_id` or `screen_name`, it will target `lists/members/destroy.json`, otherwise
   * it will target `lists/members/destroy_all.json`.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/post-lists-members-destroy_all
   */
  removeListMembers(options) {
    const hasMultiple = options.user_id && hasMultipleItems(options.user_id) || options.screen_name && hasMultipleItems(options.screen_name);
    const endpoint2 = hasMultiple ? "lists/members/destroy_all.json" : "lists/members/destroy.json";
    return this.post(endpoint2, options);
  }
  /**
   * Subscribes the authenticated user to the specified list.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/post-lists-subscribers-create
   */
  subscribeToList(options) {
    return this.post("lists/subscribers/create.json", { tweet_mode: "extended", ...options });
  }
  /**
   * Unsubscribes the authenticated user of the specified list.
   * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/post-lists-subscribers-destroy
   */
  unsubscribeOfList(options) {
    return this.post("lists/subscribers/destroy.json", { tweet_mode: "extended", ...options });
  }
  /* Media upload API */
  /**
   * This endpoint can be used to provide additional information about the uploaded media_id.
   * This feature is currently only supported for images and GIFs.
   * https://developer.x.com/en/docs/twitter-api/v1/media/upload-media/api-reference/post-media-metadata-create
   */
  createMediaMetadata(mediaId, metadata) {
    return this.post("media/metadata/create.json", { media_id: mediaId, ...metadata }, { prefix: API_V1_1_UPLOAD_PREFIX, forceBodyMode: "json" });
  }
  /**
   * Use this endpoint to associate uploaded subtitles to an uploaded video. You can associate subtitles to video before or after Tweeting.
   * **To obtain subtitle media ID, you must upload each subtitle file separately using `.uploadMedia()` method.**
   *
   * https://developer.x.com/en/docs/twitter-api/v1/media/upload-media/api-reference/post-media-subtitles-create
   */
  createMediaSubtitles(mediaId, subtitles) {
    return this.post("media/subtitles/create.json", { media_id: mediaId, media_category: "TweetVideo", subtitle_info: { subtitles } }, { prefix: API_V1_1_UPLOAD_PREFIX, forceBodyMode: "json" });
  }
  /**
   * Use this endpoint to dissociate subtitles from a video and delete the subtitles. You can dissociate subtitles from a video before or after Tweeting.
   * https://developer.x.com/en/docs/twitter-api/v1/media/upload-media/api-reference/post-media-subtitles-delete
   */
  deleteMediaSubtitles(mediaId, ...languages) {
    return this.post("media/subtitles/delete.json", {
      media_id: mediaId,
      media_category: "TweetVideo",
      subtitle_info: { subtitles: languages.map((lang) => ({ language_code: lang })) }
    }, { prefix: API_V1_1_UPLOAD_PREFIX, forceBodyMode: "json" });
  }
  async uploadMedia(file, options = {}, returnFullMediaData = false) {
    var _a;
    const chunkLength = (_a = options.chunkLength) !== null && _a !== void 0 ? _a : 1024 * 1024;
    const { fileHandle, mediaCategory, fileSize, mimeType } = await this.getUploadMediaRequirements(file, options);
    try {
      const mediaData = await this.post(UPLOAD_ENDPOINT, {
        command: "INIT",
        total_bytes: fileSize,
        media_type: mimeType,
        media_category: mediaCategory,
        additional_owners: options.additionalOwners,
        shared: options.shared ? true : void 0
      }, { prefix: API_V1_1_UPLOAD_PREFIX });
      await this.mediaChunkedUpload(fileHandle, chunkLength, mediaData.media_id_string, options.maxConcurrentUploads);
      const fullMediaData = await this.post(UPLOAD_ENDPOINT, {
        command: "FINALIZE",
        media_id: mediaData.media_id_string
      }, { prefix: API_V1_1_UPLOAD_PREFIX });
      if (fullMediaData.processing_info && fullMediaData.processing_info.state !== "succeeded") {
        await this.awaitForMediaProcessingCompletion(fullMediaData);
      }
      if (returnFullMediaData) {
        return fullMediaData;
      } else {
        return fullMediaData.media_id_string;
      }
    } finally {
      if (typeof file === "number") {
        fs4.close(file, () => {
        });
      } else if (typeof fileHandle === "object" && !(fileHandle instanceof Buffer)) {
        fileHandle.close();
      }
    }
  }
  async awaitForMediaProcessingCompletion(fullMediaData) {
    var _a;
    while (true) {
      fullMediaData = await this.mediaInfo(fullMediaData.media_id_string);
      const { processing_info } = fullMediaData;
      if (!processing_info || processing_info.state === "succeeded") {
        return;
      }
      if ((_a = processing_info.error) === null || _a === void 0 ? void 0 : _a.code) {
        const { name, message } = processing_info.error;
        throw new Error(`Failed to process media: ${name} - ${message}.`);
      }
      if (processing_info.state === "failed") {
        throw new Error("Failed to process the media.");
      }
      if (processing_info.check_after_secs) {
        await sleepSecs(processing_info.check_after_secs);
      } else {
        await sleepSecs(5);
      }
    }
  }
  async getUploadMediaRequirements(file, { mimeType, type, target, longVideo } = {}) {
    let fileHandle;
    try {
      fileHandle = await getFileHandle(file);
      const realMimeType = getMimeType(file, type, mimeType);
      let mediaCategory;
      if (realMimeType === EUploadMimeType.Mp4 && (!mimeType && !type && target !== "dm" || longVideo)) {
        mediaCategory = "amplify_video";
      } else {
        mediaCategory = getMediaCategoryByMime(realMimeType, target !== null && target !== void 0 ? target : "tweet");
      }
      return {
        fileHandle,
        mediaCategory,
        fileSize: await getFileSizeFromFileHandle(fileHandle),
        mimeType: realMimeType
      };
    } catch (e) {
      if (typeof file === "number") {
        fs4.close(file, () => {
        });
      } else if (typeof fileHandle === "object" && !(fileHandle instanceof Buffer)) {
        fileHandle.close();
      }
      throw e;
    }
  }
  async mediaChunkedUpload(fileHandle, chunkLength, mediaId, maxConcurrentUploads = 3) {
    let chunkIndex = 0;
    if (maxConcurrentUploads < 1) {
      throw new RangeError("Bad maxConcurrentUploads parameter.");
    }
    const buffer = fileHandle instanceof Buffer ? void 0 : Buffer.alloc(chunkLength);
    let readBuffer;
    let nread;
    let offset = 0;
    [readBuffer, nread] = await readNextPartOf(fileHandle, chunkLength, offset, buffer);
    offset += nread;
    const currentUploads = /* @__PURE__ */ new Set();
    while (nread) {
      const mediaBufferPart = readBuffer.slice(0, nread);
      if (mediaBufferPart.length) {
        const request3 = this.post(UPLOAD_ENDPOINT, {
          command: "APPEND",
          media_id: mediaId,
          segment_index: chunkIndex,
          media: mediaBufferPart
        }, { prefix: API_V1_1_UPLOAD_PREFIX });
        currentUploads.add(request3);
        request3.then(() => {
          currentUploads.delete(request3);
        });
        chunkIndex++;
      }
      if (currentUploads.size >= maxConcurrentUploads) {
        await Promise.race(currentUploads);
      }
      [readBuffer, nread] = await readNextPartOf(fileHandle, chunkLength, offset, buffer);
      offset += nread;
    }
    await Promise.all([...currentUploads]);
  }
};

// node_modules/twitter-api-v2/dist/esm/v1/client.v1.js
var TwitterApiv1 = class extends TwitterApiv1ReadWrite {
  constructor() {
    super(...arguments);
    this._prefix = API_V1_1_PREFIX;
  }
  /**
   * Get a client with read/write rights.
   */
  get readWrite() {
    return this;
  }
  /* Direct messages */
  // Part: Sending and receiving events
  /**
   * Publishes a new message_create event resulting in a Direct Message sent to a specified user from the authenticating user.
   * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/sending-and-receiving/api-reference/new-event
   */
  sendDm({ recipient_id, custom_profile_id, ...params }) {
    const args = {
      event: {
        type: EDirectMessageEventTypeV1.Create,
        [EDirectMessageEventTypeV1.Create]: {
          target: { recipient_id },
          message_data: params
        }
      }
    };
    if (custom_profile_id) {
      args.event[EDirectMessageEventTypeV1.Create].custom_profile_id = custom_profile_id;
    }
    return this.post("direct_messages/events/new.json", args, {
      forceBodyMode: "json"
    });
  }
  /**
   * Returns a single Direct Message event by the given id.
   *
   * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/sending-and-receiving/api-reference/get-event
   */
  getDmEvent(id) {
    return this.get("direct_messages/events/show.json", { id });
  }
  /**
   * Deletes the direct message specified in the required ID parameter.
   * The authenticating user must be the recipient of the specified direct message.
   * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/sending-and-receiving/api-reference/delete-message-event
   */
  deleteDm(id) {
    return this.delete("direct_messages/events/destroy.json", { id });
  }
  /**
   * Returns all Direct Message events (both sent and received) within the last 30 days.
   * Sorted in reverse-chronological order.
   *
   * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/sending-and-receiving/api-reference/list-events
   */
  async listDmEvents(args = {}) {
    const queryParams = { ...args };
    const initialRq = await this.get("direct_messages/events/list.json", queryParams, { fullResponse: true });
    return new DmEventsV1Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams
    });
  }
  // Part: Welcome messages (events)
  /**
   * Creates a new Welcome Message that will be stored and sent in the future from the authenticating user in defined circumstances.
   * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/welcome-messages/api-reference/new-welcome-message
   */
  newWelcomeDm(name, data) {
    const args = {
      [EDirectMessageEventTypeV1.WelcomeCreate]: {
        name,
        message_data: data
      }
    };
    return this.post("direct_messages/welcome_messages/new.json", args, {
      forceBodyMode: "json"
    });
  }
  /**
   * Returns a Welcome Message by the given id.
   * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/welcome-messages/api-reference/get-welcome-message
   */
  getWelcomeDm(id) {
    return this.get("direct_messages/welcome_messages/show.json", { id });
  }
  /**
   * Deletes a Welcome Message by the given id.
   * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/welcome-messages/api-reference/delete-welcome-message
   */
  deleteWelcomeDm(id) {
    return this.delete("direct_messages/welcome_messages/destroy.json", { id });
  }
  /**
   * Updates a Welcome Message by the given ID.
   * Updates to the welcome_message object are atomic.
   * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/welcome-messages/api-reference/update-welcome-message
   */
  updateWelcomeDm(id, data) {
    const args = { message_data: data };
    return this.put("direct_messages/welcome_messages/update.json", args, {
      forceBodyMode: "json",
      query: { id }
    });
  }
  /**
   * Returns all Direct Message events (both sent and received) within the last 30 days.
   * Sorted in reverse-chronological order.
   *
   * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/sending-and-receiving/api-reference/list-events
   */
  async listWelcomeDms(args = {}) {
    const queryParams = { ...args };
    const initialRq = await this.get("direct_messages/welcome_messages/list.json", queryParams, { fullResponse: true });
    return new WelcomeDmV1Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams
    });
  }
  // Part: Welcome message (rules)
  /**
   * Creates a new Welcome Message Rule that determines which Welcome Message will be shown in a given conversation.
   * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/welcome-messages/api-reference/new-welcome-message-rule
   */
  newWelcomeDmRule(welcomeMessageId) {
    return this.post("direct_messages/welcome_messages/rules/new.json", {
      welcome_message_rule: { welcome_message_id: welcomeMessageId }
    }, {
      forceBodyMode: "json"
    });
  }
  /**
   * Returns a Welcome Message Rule by the given id.
   * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/welcome-messages/api-reference/get-welcome-message-rule
   */
  getWelcomeDmRule(id) {
    return this.get("direct_messages/welcome_messages/rules/show.json", { id });
  }
  /**
   * Deletes a Welcome Message Rule by the given id.
   * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/welcome-messages/api-reference/delete-welcome-message-rule
   */
  deleteWelcomeDmRule(id) {
    return this.delete("direct_messages/welcome_messages/rules/destroy.json", { id });
  }
  /**
   * Retrieves all welcome DM rules for this account.
   * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/welcome-messages/api-reference/list-welcome-message-rules
   */
  async listWelcomeDmRules(args = {}) {
    const queryParams = { ...args };
    return this.get("direct_messages/welcome_messages/rules/list.json", queryParams);
  }
  /**
   * Set the current showed welcome message for logged account ; wrapper for Welcome DM rules.
   * Test if a rule already exists, delete if any, then create a rule for current message ID.
   *
   * If you don't have already a welcome message, create it with `.newWelcomeMessage`.
   */
  async setWelcomeDm(welcomeMessageId, deleteAssociatedWelcomeDmWhenDeletingRule = true) {
    var _a;
    const existingRules = await this.listWelcomeDmRules();
    if ((_a = existingRules.welcome_message_rules) === null || _a === void 0 ? void 0 : _a.length) {
      for (const rule of existingRules.welcome_message_rules) {
        await this.deleteWelcomeDmRule(rule.id);
        if (deleteAssociatedWelcomeDmWhenDeletingRule) {
          await this.deleteWelcomeDm(rule.welcome_message_id);
        }
      }
    }
    return this.newWelcomeDmRule(welcomeMessageId);
  }
  // Part: Read indicator
  /**
   * Marks a message as read in the recipient’s Direct Message conversation view with the sender.
   * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/typing-indicator-and-read-receipts/api-reference/new-read-receipt
   */
  markDmAsRead(lastEventId, recipientId) {
    return this.post("direct_messages/mark_read.json", {
      last_read_event_id: lastEventId,
      recipient_id: recipientId
    }, { forceBodyMode: "url" });
  }
  /**
   * Displays a visual typing indicator in the recipient’s Direct Message conversation view with the sender.
   * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/typing-indicator-and-read-receipts/api-reference/new-typing-indicator
   */
  indicateDmTyping(recipientId) {
    return this.post("direct_messages/indicate_typing.json", {
      recipient_id: recipientId
    }, { forceBodyMode: "url" });
  }
  // Part: Images
  /**
   * Get a single image attached to a direct message. TwitterApi client must be logged with OAuth 1.0a.
   * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/message-attachments/guides/retrieving-media
   */
  async downloadDmImage(urlOrDm) {
    if (typeof urlOrDm !== "string") {
      const attachment = urlOrDm[EDirectMessageEventTypeV1.Create].message_data.attachment;
      if (!attachment) {
        throw new Error("The given direct message doesn't contain any attachment");
      }
      urlOrDm = attachment.media.media_url_https;
    }
    const data = await this.get(urlOrDm, void 0, { forceParseMode: "buffer", prefix: "" });
    if (!data.length) {
      throw new Error("Image not found. Make sure you are logged with credentials able to access direct messages, and check the URL.");
    }
    return data;
  }
};
var client_v1_default = TwitterApiv1;

// node_modules/twitter-api-v2/dist/esm/v2/includes.v2.helper.js
var TwitterV2IncludesHelper = class _TwitterV2IncludesHelper {
  constructor(result) {
    this.result = result;
  }
  /* Tweets */
  get tweets() {
    return _TwitterV2IncludesHelper.tweets(this.result);
  }
  static tweets(result) {
    var _a, _b;
    return (_b = (_a = result.includes) === null || _a === void 0 ? void 0 : _a.tweets) !== null && _b !== void 0 ? _b : [];
  }
  tweetById(id) {
    return _TwitterV2IncludesHelper.tweetById(this.result, id);
  }
  static tweetById(result, id) {
    return this.tweets(result).find((tweet) => tweet.id === id);
  }
  /** Retweet associated with the given tweet (*`referenced_tweets.id`*) */
  retweet(tweet) {
    return _TwitterV2IncludesHelper.retweet(this.result, tweet);
  }
  /** Retweet associated with the given tweet (*`referenced_tweets.id`*) */
  static retweet(result, tweet) {
    var _a;
    const retweetIds = ((_a = tweet.referenced_tweets) !== null && _a !== void 0 ? _a : []).filter((ref) => ref.type === "retweeted").map((ref) => ref.id);
    return this.tweets(result).find((t) => retweetIds.includes(t.id));
  }
  /** Quoted tweet associated with the given tweet (*`referenced_tweets.id`*) */
  quote(tweet) {
    return _TwitterV2IncludesHelper.quote(this.result, tweet);
  }
  /** Quoted tweet associated with the given tweet (*`referenced_tweets.id`*) */
  static quote(result, tweet) {
    var _a;
    const quoteIds = ((_a = tweet.referenced_tweets) !== null && _a !== void 0 ? _a : []).filter((ref) => ref.type === "quoted").map((ref) => ref.id);
    return this.tweets(result).find((t) => quoteIds.includes(t.id));
  }
  /** Tweet whose has been answered by the given tweet (*`referenced_tweets.id`*) */
  repliedTo(tweet) {
    return _TwitterV2IncludesHelper.repliedTo(this.result, tweet);
  }
  /** Tweet whose has been answered by the given tweet (*`referenced_tweets.id`*) */
  static repliedTo(result, tweet) {
    var _a;
    const repliesIds = ((_a = tweet.referenced_tweets) !== null && _a !== void 0 ? _a : []).filter((ref) => ref.type === "replied_to").map((ref) => ref.id);
    return this.tweets(result).find((t) => repliesIds.includes(t.id));
  }
  /** Tweet author user object of the given tweet (*`author_id`* or *`referenced_tweets.id.author_id`*) */
  author(tweet) {
    return _TwitterV2IncludesHelper.author(this.result, tweet);
  }
  /** Tweet author user object of the given tweet (*`author_id`* or *`referenced_tweets.id.author_id`*) */
  static author(result, tweet) {
    const authorId = tweet.author_id;
    return authorId ? this.users(result).find((u) => u.id === authorId) : void 0;
  }
  /** Tweet author user object of the tweet answered by the given tweet (*`in_reply_to_user_id`*) */
  repliedToAuthor(tweet) {
    return _TwitterV2IncludesHelper.repliedToAuthor(this.result, tweet);
  }
  /** Tweet author user object of the tweet answered by the given tweet (*`in_reply_to_user_id`*) */
  static repliedToAuthor(result, tweet) {
    const inReplyUserId = tweet.in_reply_to_user_id;
    return inReplyUserId ? this.users(result).find((u) => u.id === inReplyUserId) : void 0;
  }
  /* Users */
  get users() {
    return _TwitterV2IncludesHelper.users(this.result);
  }
  static users(result) {
    var _a, _b;
    return (_b = (_a = result.includes) === null || _a === void 0 ? void 0 : _a.users) !== null && _b !== void 0 ? _b : [];
  }
  userById(id) {
    return _TwitterV2IncludesHelper.userById(this.result, id);
  }
  static userById(result, id) {
    return this.users(result).find((u) => u.id === id);
  }
  /** Pinned tweet of the given user (*`pinned_tweet_id`*) */
  pinnedTweet(user) {
    return _TwitterV2IncludesHelper.pinnedTweet(this.result, user);
  }
  /** Pinned tweet of the given user (*`pinned_tweet_id`*) */
  static pinnedTweet(result, user) {
    return user.pinned_tweet_id ? this.tweets(result).find((t) => t.id === user.pinned_tweet_id) : void 0;
  }
  /* Medias */
  get media() {
    return _TwitterV2IncludesHelper.media(this.result);
  }
  static media(result) {
    var _a, _b;
    return (_b = (_a = result.includes) === null || _a === void 0 ? void 0 : _a.media) !== null && _b !== void 0 ? _b : [];
  }
  /** Medias associated with the given tweet (*`attachments.media_keys`*) */
  medias(tweet) {
    return _TwitterV2IncludesHelper.medias(this.result, tweet);
  }
  /** Medias associated with the given tweet (*`attachments.media_keys`*) */
  static medias(result, tweet) {
    var _a, _b;
    const keys = (_b = (_a = tweet.attachments) === null || _a === void 0 ? void 0 : _a.media_keys) !== null && _b !== void 0 ? _b : [];
    return this.media(result).filter((m) => keys.includes(m.media_key));
  }
  /* Polls */
  get polls() {
    return _TwitterV2IncludesHelper.polls(this.result);
  }
  static polls(result) {
    var _a, _b;
    return (_b = (_a = result.includes) === null || _a === void 0 ? void 0 : _a.polls) !== null && _b !== void 0 ? _b : [];
  }
  /** Poll associated with the given tweet (*`attachments.poll_ids`*) */
  poll(tweet) {
    return _TwitterV2IncludesHelper.poll(this.result, tweet);
  }
  /** Poll associated with the given tweet (*`attachments.poll_ids`*) */
  static poll(result, tweet) {
    var _a, _b;
    const pollIds = (_b = (_a = tweet.attachments) === null || _a === void 0 ? void 0 : _a.poll_ids) !== null && _b !== void 0 ? _b : [];
    if (pollIds.length) {
      const pollId = pollIds[0];
      return this.polls(result).find((p) => p.id === pollId);
    }
    return void 0;
  }
  /* Places */
  get places() {
    return _TwitterV2IncludesHelper.places(this.result);
  }
  static places(result) {
    var _a, _b;
    return (_b = (_a = result.includes) === null || _a === void 0 ? void 0 : _a.places) !== null && _b !== void 0 ? _b : [];
  }
  /** Place associated with the given tweet (*`geo.place_id`*) */
  place(tweet) {
    return _TwitterV2IncludesHelper.place(this.result, tweet);
  }
  /** Place associated with the given tweet (*`geo.place_id`*) */
  static place(result, tweet) {
    var _a;
    const placeId = (_a = tweet.geo) === null || _a === void 0 ? void 0 : _a.place_id;
    return placeId ? this.places(result).find((p) => p.id === placeId) : void 0;
  }
  /* Lists */
  /** List owner of the given list (*`owner_id`*) */
  listOwner(list) {
    return _TwitterV2IncludesHelper.listOwner(this.result, list);
  }
  /** List owner of the given list (*`owner_id`*) */
  static listOwner(result, list) {
    const creatorId = list.owner_id;
    return creatorId ? this.users(result).find((p) => p.id === creatorId) : void 0;
  }
  /* Spaces */
  /** Creator of the given space (*`creator_id`*) */
  spaceCreator(space) {
    return _TwitterV2IncludesHelper.spaceCreator(this.result, space);
  }
  /** Creator of the given space (*`creator_id`*) */
  static spaceCreator(result, space) {
    const creatorId = space.creator_id;
    return creatorId ? this.users(result).find((p) => p.id === creatorId) : void 0;
  }
  /** Current hosts of the given space (*`host_ids`*) */
  spaceHosts(space) {
    return _TwitterV2IncludesHelper.spaceHosts(this.result, space);
  }
  /** Current hosts of the given space (*`host_ids`*) */
  static spaceHosts(result, space) {
    var _a;
    const hostIds = (_a = space.host_ids) !== null && _a !== void 0 ? _a : [];
    return this.users(result).filter((u) => hostIds.includes(u.id));
  }
  /** Current speakers of the given space (*`speaker_ids`*) */
  spaceSpeakers(space) {
    return _TwitterV2IncludesHelper.spaceSpeakers(this.result, space);
  }
  /** Current speakers of the given space (*`speaker_ids`*) */
  static spaceSpeakers(result, space) {
    var _a;
    const speakerIds = (_a = space.speaker_ids) !== null && _a !== void 0 ? _a : [];
    return this.users(result).filter((u) => speakerIds.includes(u.id));
  }
  /** Current invited users of the given space (*`invited_user_ids`*) */
  spaceInvitedUsers(space) {
    return _TwitterV2IncludesHelper.spaceInvitedUsers(this.result, space);
  }
  /** Current invited users of the given space (*`invited_user_ids`*) */
  static spaceInvitedUsers(result, space) {
    var _a;
    const invitedUserIds = (_a = space.invited_user_ids) !== null && _a !== void 0 ? _a : [];
    return this.users(result).filter((u) => invitedUserIds.includes(u.id));
  }
};

// node_modules/twitter-api-v2/dist/esm/paginators/v2.paginator.js
var TwitterV2Paginator = class extends PreviousableTwitterPaginator {
  updateIncludes(data) {
    if (data.errors) {
      if (!this._realData.errors) {
        this._realData.errors = [];
      }
      this._realData.errors = [...this._realData.errors, ...data.errors];
    }
    if (!data.includes) {
      return;
    }
    if (!this._realData.includes) {
      this._realData.includes = {};
    }
    const includesRealData = this._realData.includes;
    for (const [includeKey, includeArray] of Object.entries(data.includes)) {
      if (!includesRealData[includeKey]) {
        includesRealData[includeKey] = [];
      }
      includesRealData[includeKey] = [
        ...includesRealData[includeKey],
        ...includeArray
      ];
    }
  }
  /** Throw if the current paginator is not usable. */
  assertUsable() {
    if (this.unusable) {
      throw new Error("Unable to use this paginator to fetch more data, as it does not contain any metadata. Check .errors property for more details.");
    }
  }
  get meta() {
    return this._realData.meta;
  }
  get includes() {
    var _a;
    if (!((_a = this._realData) === null || _a === void 0 ? void 0 : _a.includes)) {
      return new TwitterV2IncludesHelper(this._realData);
    }
    if (this._includesInstance) {
      return this._includesInstance;
    }
    return this._includesInstance = new TwitterV2IncludesHelper(this._realData);
  }
  get errors() {
    var _a;
    return (_a = this._realData.errors) !== null && _a !== void 0 ? _a : [];
  }
  /** `true` if this paginator only contains error payload and no metadata found to consume data. */
  get unusable() {
    return this.errors.length > 0 && !this._realData.meta && !this._realData.data;
  }
};
var TimelineV2Paginator = class extends TwitterV2Paginator {
  refreshInstanceFromResult(response, isNextPage) {
    var _a;
    const result = response.data;
    const resultData = (_a = result.data) !== null && _a !== void 0 ? _a : [];
    this._rateLimit = response.rateLimit;
    if (!this._realData.data) {
      this._realData.data = [];
    }
    if (isNextPage) {
      this._realData.meta.result_count += result.meta.result_count;
      this._realData.meta.next_token = result.meta.next_token;
      this._realData.data.push(...resultData);
    } else {
      this._realData.meta.result_count += result.meta.result_count;
      this._realData.meta.previous_token = result.meta.previous_token;
      this._realData.data.unshift(...resultData);
    }
    this.updateIncludes(result);
  }
  getNextQueryParams(maxResults) {
    this.assertUsable();
    return {
      ...this.injectQueryParams(maxResults),
      pagination_token: this._realData.meta.next_token
    };
  }
  getPreviousQueryParams(maxResults) {
    this.assertUsable();
    return {
      ...this.injectQueryParams(maxResults),
      pagination_token: this._realData.meta.previous_token
    };
  }
  getPageLengthFromRequest(result) {
    var _a, _b;
    return (_b = (_a = result.data.data) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0;
  }
  isFetchLastOver(result) {
    var _a;
    return !((_a = result.data.data) === null || _a === void 0 ? void 0 : _a.length) || !this.canFetchNextPage(result.data);
  }
  canFetchNextPage(result) {
    var _a;
    return !!((_a = result.meta) === null || _a === void 0 ? void 0 : _a.next_token);
  }
};

// node_modules/twitter-api-v2/dist/esm/paginators/tweet.paginator.v2.js
var TweetTimelineV2Paginator = class extends TwitterV2Paginator {
  refreshInstanceFromResult(response, isNextPage) {
    var _a;
    const result = response.data;
    const resultData = (_a = result.data) !== null && _a !== void 0 ? _a : [];
    this._rateLimit = response.rateLimit;
    if (!this._realData.data) {
      this._realData.data = [];
    }
    if (isNextPage) {
      this._realData.meta.oldest_id = result.meta.oldest_id;
      this._realData.meta.result_count += result.meta.result_count;
      this._realData.meta.next_token = result.meta.next_token;
      this._realData.data.push(...resultData);
    } else {
      this._realData.meta.newest_id = result.meta.newest_id;
      this._realData.meta.result_count += result.meta.result_count;
      this._realData.data.unshift(...resultData);
    }
    this.updateIncludes(result);
  }
  getNextQueryParams(maxResults) {
    this.assertUsable();
    const params = { ...this.injectQueryParams(maxResults) };
    if (this._realData.meta.next_token) {
      params.next_token = this._realData.meta.next_token;
    } else {
      if (params.start_time) {
        params.since_id = this.dateStringToSnowflakeId(params.start_time);
        delete params.start_time;
      }
      if (params.end_time) {
        delete params.end_time;
      }
      params.until_id = this._realData.meta.oldest_id;
    }
    return params;
  }
  getPreviousQueryParams(maxResults) {
    this.assertUsable();
    return {
      ...this.injectQueryParams(maxResults),
      since_id: this._realData.meta.newest_id
    };
  }
  getPageLengthFromRequest(result) {
    var _a, _b;
    return (_b = (_a = result.data.data) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0;
  }
  isFetchLastOver(result) {
    var _a;
    return !((_a = result.data.data) === null || _a === void 0 ? void 0 : _a.length) || !this.canFetchNextPage(result.data);
  }
  canFetchNextPage(result) {
    return !!result.meta.next_token;
  }
  getItemArray() {
    return this.tweets;
  }
  dateStringToSnowflakeId(dateStr) {
    const TWITTER_START_EPOCH = BigInt("1288834974657");
    const date = new Date(dateStr);
    if (isNaN(date.valueOf())) {
      throw new Error("Unable to convert start_time/end_time to a valid date. A ISO 8601 DateTime is excepted, please check your input.");
    }
    const dateTimestamp = BigInt(date.valueOf());
    return (dateTimestamp - TWITTER_START_EPOCH << BigInt("22")).toString();
  }
  /**
   * Tweets returned by paginator.
   */
  get tweets() {
    var _a;
    return (_a = this._realData.data) !== null && _a !== void 0 ? _a : [];
  }
  get meta() {
    return super.meta;
  }
};
var TweetPaginableTimelineV2Paginator = class extends TimelineV2Paginator {
  refreshInstanceFromResult(response, isNextPage) {
    super.refreshInstanceFromResult(response, isNextPage);
    const result = response.data;
    if (isNextPage) {
      this._realData.meta.oldest_id = result.meta.oldest_id;
    } else {
      this._realData.meta.newest_id = result.meta.newest_id;
    }
  }
  getItemArray() {
    return this.tweets;
  }
  /**
   * Tweets returned by paginator.
   */
  get tweets() {
    var _a;
    return (_a = this._realData.data) !== null && _a !== void 0 ? _a : [];
  }
  get meta() {
    return super.meta;
  }
};
var TweetSearchRecentV2Paginator = class extends TweetTimelineV2Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "tweets/search/recent";
  }
};
var TweetSearchAllV2Paginator = class extends TweetTimelineV2Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "tweets/search/all";
  }
};
var QuotedTweetsTimelineV2Paginator = class extends TweetPaginableTimelineV2Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "tweets/:id/quote_tweets";
  }
};
var TweetHomeTimelineV2Paginator = class extends TweetPaginableTimelineV2Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "users/:id/timelines/reverse_chronological";
  }
};
var TweetUserTimelineV2Paginator = class extends TweetPaginableTimelineV2Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "users/:id/tweets";
  }
};
var TweetUserMentionTimelineV2Paginator = class extends TweetPaginableTimelineV2Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "users/:id/mentions";
  }
};
var TweetBookmarksTimelineV2Paginator = class extends TweetPaginableTimelineV2Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "users/:id/bookmarks";
  }
};
var TweetListV2Paginator = class extends TimelineV2Paginator {
  /**
   * Tweets returned by paginator.
   */
  get tweets() {
    var _a;
    return (_a = this._realData.data) !== null && _a !== void 0 ? _a : [];
  }
  get meta() {
    return super.meta;
  }
  getItemArray() {
    return this.tweets;
  }
};
var TweetV2UserLikedTweetsPaginator = class extends TweetListV2Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "users/:id/liked_tweets";
  }
};
var TweetV2ListTweetsPaginator = class extends TweetListV2Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "lists/:id/tweets";
  }
};

// node_modules/twitter-api-v2/dist/esm/paginators/user.paginator.v2.js
var UserTimelineV2Paginator = class extends TimelineV2Paginator {
  getItemArray() {
    return this.users;
  }
  /**
   * Users returned by paginator.
   */
  get users() {
    var _a;
    return (_a = this._realData.data) !== null && _a !== void 0 ? _a : [];
  }
  get meta() {
    return super.meta;
  }
};
var UserBlockingUsersV2Paginator = class extends UserTimelineV2Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "users/:id/blocking";
  }
};
var UserMutingUsersV2Paginator = class extends UserTimelineV2Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "users/:id/muting";
  }
};
var UserFollowersV2Paginator = class extends UserTimelineV2Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "users/:id/followers";
  }
};
var UserFollowingV2Paginator = class extends UserTimelineV2Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "users/:id/following";
  }
};
var UserListMembersV2Paginator = class extends UserTimelineV2Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "lists/:id/members";
  }
};
var UserListFollowersV2Paginator = class extends UserTimelineV2Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "lists/:id/followers";
  }
};
var TweetLikingUsersV2Paginator = class extends UserTimelineV2Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "tweets/:id/liking_users";
  }
};
var TweetRetweetersUsersV2Paginator = class extends UserTimelineV2Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "tweets/:id/retweeted_by";
  }
};

// node_modules/twitter-api-v2/dist/esm/paginators/list.paginator.v2.js
var ListTimelineV2Paginator = class extends TimelineV2Paginator {
  getItemArray() {
    return this.lists;
  }
  /**
   * Lists returned by paginator.
   */
  get lists() {
    var _a;
    return (_a = this._realData.data) !== null && _a !== void 0 ? _a : [];
  }
  get meta() {
    return super.meta;
  }
};
var UserOwnedListsV2Paginator = class extends ListTimelineV2Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "users/:id/owned_lists";
  }
};
var UserListMembershipsV2Paginator = class extends ListTimelineV2Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "users/:id/list_memberships";
  }
};
var UserListFollowedV2Paginator = class extends ListTimelineV2Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "users/:id/followed_lists";
  }
};

// node_modules/twitter-api-v2/dist/esm/v2-labs/client.v2.labs.read.js
var TwitterApiv2LabsReadOnly = class extends TwitterApiSubClient {
  constructor() {
    super(...arguments);
    this._prefix = API_V2_LABS_PREFIX;
  }
};

// node_modules/twitter-api-v2/dist/esm/paginators/dm.paginator.v2.js
var DMTimelineV2Paginator = class extends TimelineV2Paginator {
  getItemArray() {
    return this.events;
  }
  /**
   * Events returned by paginator.
   */
  get events() {
    var _a;
    return (_a = this._realData.data) !== null && _a !== void 0 ? _a : [];
  }
  get meta() {
    return super.meta;
  }
};
var FullDMTimelineV2Paginator = class extends DMTimelineV2Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "dm_events";
  }
};
var OneToOneDMTimelineV2Paginator = class extends DMTimelineV2Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "dm_conversations/with/:participant_id/dm_events";
  }
};
var ConversationDMTimelineV2Paginator = class extends DMTimelineV2Paginator {
  constructor() {
    super(...arguments);
    this._endpoint = "dm_conversations/:dm_conversation_id/dm_events";
  }
};

// node_modules/twitter-api-v2/dist/esm/v2/client.v2.read.js
var TwitterApiv2ReadOnly = class extends TwitterApiSubClient {
  constructor() {
    super(...arguments);
    this._prefix = API_V2_PREFIX;
  }
  /* Sub-clients */
  /**
   * Get a client for v2 labs endpoints.
   */
  get labs() {
    if (this._labs)
      return this._labs;
    return this._labs = new TwitterApiv2LabsReadOnly(this);
  }
  async search(queryOrOptions, options = {}) {
    const queryParams = typeof queryOrOptions === "string" ? { ...options, query: queryOrOptions } : { ...queryOrOptions };
    const initialRq = await this.get("tweets/search/recent", queryParams, { fullResponse: true });
    return new TweetSearchRecentV2Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams
    });
  }
  /**
   * The full-archive search endpoint returns the complete history of public Tweets matching a search query;
   * since the first Tweet was created March 26, 2006.
   *
   * This endpoint is only available to those users who have been approved for the Academic Research product track.
   * https://developer.x.com/en/docs/twitter-api/tweets/search/api-reference/get-tweets-search-all
   */
  async searchAll(query, options = {}) {
    const queryParams = { ...options, query };
    const initialRq = await this.get("tweets/search/all", queryParams, { fullResponse: true });
    return new TweetSearchAllV2Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams
    });
  }
  /**
   * Returns a variety of information about a single Tweet specified by the requested ID.
   * https://developer.x.com/en/docs/twitter-api/tweets/lookup/api-reference/get-tweets-id
   *
   * OAuth2 scope: `users.read`, `tweet.read`
   */
  singleTweet(tweetId, options = {}) {
    return this.get("tweets/:id", options, { params: { id: tweetId } });
  }
  /**
   * Returns a variety of information about tweets specified by list of IDs.
   * https://developer.x.com/en/docs/twitter-api/tweets/lookup/api-reference/get-tweets
   *
   * OAuth2 scope: `users.read`, `tweet.read`
   */
  tweets(tweetIds, options = {}) {
    return this.get("tweets", { ids: tweetIds, ...options });
  }
  /**
   * The recent Tweet counts endpoint returns count of Tweets from the last seven days that match a search query.
   * OAuth2 Bearer auth only.
   * https://developer.x.com/en/docs/twitter-api/tweets/counts/api-reference/get-tweets-counts-recent
   */
  tweetCountRecent(query, options = {}) {
    return this.get("tweets/counts/recent", { query, ...options });
  }
  /**
   * This endpoint is only available to those users who have been approved for the Academic Research product track.
   * The full-archive search endpoint returns the complete history of public Tweets matching a search query;
   * since the first Tweet was created March 26, 2006.
   * OAuth2 Bearer auth only.
   * **This endpoint has pagination, yet it is not supported by bundled paginators. Use `next_token` to fetch next page.**
   * https://developer.x.com/en/docs/twitter-api/tweets/counts/api-reference/get-tweets-counts-all
   */
  tweetCountAll(query, options = {}) {
    return this.get("tweets/counts/all", { query, ...options });
  }
  async tweetRetweetedBy(tweetId, options = {}) {
    const { asPaginator, ...parameters } = options;
    const initialRq = await this.get("tweets/:id/retweeted_by", parameters, {
      fullResponse: true,
      params: { id: tweetId }
    });
    if (!asPaginator) {
      return initialRq.data;
    }
    return new TweetRetweetersUsersV2Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams: parameters,
      sharedParams: { id: tweetId }
    });
  }
  async tweetLikedBy(tweetId, options = {}) {
    const { asPaginator, ...parameters } = options;
    const initialRq = await this.get("tweets/:id/liking_users", parameters, {
      fullResponse: true,
      params: { id: tweetId }
    });
    if (!asPaginator) {
      return initialRq.data;
    }
    return new TweetLikingUsersV2Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams: parameters,
      sharedParams: { id: tweetId }
    });
  }
  /**
   * Allows you to retrieve a collection of the most recent Tweets and Retweets posted by you and users you follow, also known as home timeline.
   * This endpoint returns up to the last 3200 Tweets.
   * https://developer.x.com/en/docs/twitter-api/tweets/timelines/api-reference/get-users-id-reverse-chronological
   *
   * OAuth 2 scopes: `tweet.read` `users.read`
   */
  async homeTimeline(options = {}) {
    const meUser = await this.getCurrentUserV2Object();
    const initialRq = await this.get("users/:id/timelines/reverse_chronological", options, {
      fullResponse: true,
      params: { id: meUser.data.id }
    });
    return new TweetHomeTimelineV2Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams: options,
      sharedParams: { id: meUser.data.id }
    });
  }
  /**
   * Returns Tweets composed by a single user, specified by the requested user ID.
   * By default, the most recent ten Tweets are returned per request.
   * Using pagination, the most recent 3,200 Tweets can be retrieved.
   * https://developer.x.com/en/docs/twitter-api/tweets/timelines/api-reference/get-users-id-tweets
   */
  async userTimeline(userId, options = {}) {
    const initialRq = await this.get("users/:id/tweets", options, {
      fullResponse: true,
      params: { id: userId }
    });
    return new TweetUserTimelineV2Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams: options,
      sharedParams: { id: userId }
    });
  }
  /**
   * Returns Tweets mentioning a single user specified by the requested user ID.
   * By default, the most recent ten Tweets are returned per request.
   * Using pagination, up to the most recent 800 Tweets can be retrieved.
   * https://developer.x.com/en/docs/twitter-api/tweets/timelines/api-reference/get-users-id-mentions
   */
  async userMentionTimeline(userId, options = {}) {
    const initialRq = await this.get("users/:id/mentions", options, {
      fullResponse: true,
      params: { id: userId }
    });
    return new TweetUserMentionTimelineV2Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams: options,
      sharedParams: { id: userId }
    });
  }
  /**
   * Returns Quote Tweets for a Tweet specified by the requested Tweet ID.
   * https://developer.x.com/en/docs/twitter-api/tweets/quote-tweets/api-reference/get-tweets-id-quote_tweets
   *
   * OAuth2 scopes: `users.read` `tweet.read`
   */
  async quotes(tweetId, options = {}) {
    const initialRq = await this.get("tweets/:id/quote_tweets", options, {
      fullResponse: true,
      params: { id: tweetId }
    });
    return new QuotedTweetsTimelineV2Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams: options,
      sharedParams: { id: tweetId }
    });
  }
  /* Bookmarks */
  /**
   * Allows you to get information about a authenticated user’s 800 most recent bookmarked Tweets.
   * https://developer.x.com/en/docs/twitter-api/tweets/bookmarks/api-reference/get-users-id-bookmarks
   *
   * OAuth2 scopes: `users.read` `tweet.read` `bookmark.read`
   */
  async bookmarks(options = {}) {
    const user = await this.getCurrentUserV2Object();
    const initialRq = await this.get("users/:id/bookmarks", options, {
      fullResponse: true,
      params: { id: user.data.id }
    });
    return new TweetBookmarksTimelineV2Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams: options,
      sharedParams: { id: user.data.id }
    });
  }
  /* Users */
  /**
   * Returns information about an authorized user.
   * https://developer.x.com/en/docs/twitter-api/users/lookup/api-reference/get-users-me
   *
   * OAuth2 scopes: `tweet.read` & `users.read`
   */
  me(options = {}) {
    return this.get("users/me", options);
  }
  /**
   * Returns a variety of information about a single user specified by the requested ID.
   * https://developer.x.com/en/docs/twitter-api/users/lookup/api-reference/get-users-id
   */
  user(userId, options = {}) {
    return this.get("users/:id", options, { params: { id: userId } });
  }
  /**
   * Returns a variety of information about one or more users specified by the requested IDs.
   * https://developer.x.com/en/docs/twitter-api/users/lookup/api-reference/get-users
   */
  users(userIds, options = {}) {
    const ids = Array.isArray(userIds) ? userIds.join(",") : userIds;
    return this.get("users", { ...options, ids });
  }
  /**
   * Returns a variety of information about a single user specified by their username.
   * https://developer.x.com/en/docs/twitter-api/users/lookup/api-reference/get-users-by-username-username
   */
  userByUsername(username, options = {}) {
    return this.get("users/by/username/:username", options, { params: { username } });
  }
  /**
   * Returns a variety of information about one or more users specified by their usernames.
   * https://developer.x.com/en/docs/twitter-api/users/lookup/api-reference/get-users-by
   *
   * OAuth2 scope: `users.read`, `tweet.read`
   */
  usersByUsernames(usernames, options = {}) {
    usernames = Array.isArray(usernames) ? usernames.join(",") : usernames;
    return this.get("users/by", { ...options, usernames });
  }
  async followers(userId, options = {}) {
    const { asPaginator, ...parameters } = options;
    const params = { id: userId };
    if (!asPaginator) {
      return this.get("users/:id/followers", parameters, { params });
    }
    const initialRq = await this.get("users/:id/followers", parameters, { fullResponse: true, params });
    return new UserFollowersV2Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams: parameters,
      sharedParams: params
    });
  }
  async following(userId, options = {}) {
    const { asPaginator, ...parameters } = options;
    const params = { id: userId };
    if (!asPaginator) {
      return this.get("users/:id/following", parameters, { params });
    }
    const initialRq = await this.get("users/:id/following", parameters, { fullResponse: true, params });
    return new UserFollowingV2Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams: parameters,
      sharedParams: params
    });
  }
  /**
   * Allows you to get information about a user’s liked Tweets.
   * https://developer.x.com/en/docs/twitter-api/tweets/likes/api-reference/get-users-id-liked_tweets
   */
  async userLikedTweets(userId, options = {}) {
    const params = { id: userId };
    const initialRq = await this.get("users/:id/liked_tweets", options, { fullResponse: true, params });
    return new TweetV2UserLikedTweetsPaginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams: { ...options },
      sharedParams: params
    });
  }
  /**
   * Returns a list of users who are blocked by the authenticating user.
   * https://developer.x.com/en/docs/twitter-api/users/blocks/api-reference/get-users-blocking
   */
  async userBlockingUsers(userId, options = {}) {
    const params = { id: userId };
    const initialRq = await this.get("users/:id/blocking", options, { fullResponse: true, params });
    return new UserBlockingUsersV2Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams: { ...options },
      sharedParams: params
    });
  }
  /**
   * Returns a list of users who are muted by the authenticating user.
   * https://developer.x.com/en/docs/twitter-api/users/mutes/api-reference/get-users-muting
   */
  async userMutingUsers(userId, options = {}) {
    const params = { id: userId };
    const initialRq = await this.get("users/:id/muting", options, { fullResponse: true, params });
    return new UserMutingUsersV2Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams: { ...options },
      sharedParams: params
    });
  }
  /* Lists */
  /**
   * Returns the details of a specified List.
   * https://developer.x.com/en/docs/twitter-api/lists/list-lookup/api-reference/get-lists-id
   */
  list(id, options = {}) {
    return this.get("lists/:id", options, { params: { id } });
  }
  /**
   * Returns all Lists owned by the specified user.
   * https://developer.x.com/en/docs/twitter-api/lists/list-lookup/api-reference/get-users-id-owned_lists
   */
  async listsOwned(userId, options = {}) {
    const params = { id: userId };
    const initialRq = await this.get("users/:id/owned_lists", options, { fullResponse: true, params });
    return new UserOwnedListsV2Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams: { ...options },
      sharedParams: params
    });
  }
  /**
   * Returns all Lists a specified user is a member of.
   * https://developer.x.com/en/docs/twitter-api/lists/list-members/api-reference/get-users-id-list_memberships
   */
  async listMemberships(userId, options = {}) {
    const params = { id: userId };
    const initialRq = await this.get("users/:id/list_memberships", options, { fullResponse: true, params });
    return new UserListMembershipsV2Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams: { ...options },
      sharedParams: params
    });
  }
  /**
   * Returns all Lists a specified user follows.
   * https://developer.x.com/en/docs/twitter-api/lists/list-follows/api-reference/get-users-id-followed_lists
   */
  async listFollowed(userId, options = {}) {
    const params = { id: userId };
    const initialRq = await this.get("users/:id/followed_lists", options, { fullResponse: true, params });
    return new UserListFollowedV2Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams: { ...options },
      sharedParams: params
    });
  }
  /**
   * Returns a list of Tweets from the specified List.
   * https://developer.x.com/en/docs/twitter-api/lists/list-tweets/api-reference/get-lists-id-tweets
   */
  async listTweets(listId, options = {}) {
    const params = { id: listId };
    const initialRq = await this.get("lists/:id/tweets", options, { fullResponse: true, params });
    return new TweetV2ListTweetsPaginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams: { ...options },
      sharedParams: params
    });
  }
  /**
   * Returns a list of users who are members of the specified List.
   * https://developer.x.com/en/docs/twitter-api/lists/list-members/api-reference/get-lists-id-members
   */
  async listMembers(listId, options = {}) {
    const params = { id: listId };
    const initialRq = await this.get("lists/:id/members", options, { fullResponse: true, params });
    return new UserListMembersV2Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams: { ...options },
      sharedParams: params
    });
  }
  /**
   * Returns a list of users who are followers of the specified List.
   * https://developer.x.com/en/docs/twitter-api/lists/list-follows/api-reference/get-lists-id-followers
   */
  async listFollowers(listId, options = {}) {
    const params = { id: listId };
    const initialRq = await this.get("lists/:id/followers", options, { fullResponse: true, params });
    return new UserListFollowersV2Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams: { ...options },
      sharedParams: params
    });
  }
  /* Direct messages */
  /**
   * Returns a list of Direct Messages for the authenticated user, both sent and received.
   * Direct Message events are returned in reverse chronological order.
   * Supports retrieving events from the previous 30 days.
   *
   * OAuth 2 scopes: `dm.read`, `tweet.read`, `user.read`
   *
   * https://developer.x.com/en/docs/twitter-api/direct-messages/lookup/api-reference/get-dm_events
   */
  async listDmEvents(options = {}) {
    const initialRq = await this.get("dm_events", options, { fullResponse: true });
    return new FullDMTimelineV2Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams: { ...options }
    });
  }
  /**
   * Returns a list of Direct Messages (DM) events within a 1-1 conversation with the user specified in the participant_id path parameter.
   * Messages are returned in reverse chronological order.
   *
   * OAuth 2 scopes: `dm.read`, `tweet.read`, `user.read`
   *
   * https://developer.x.com/en/docs/twitter-api/direct-messages/lookup/api-reference/get-dm_conversations-dm_conversation_id-dm_events
   */
  async listDmEventsWithParticipant(participantId, options = {}) {
    const params = { participant_id: participantId };
    const initialRq = await this.get("dm_conversations/with/:participant_id/dm_events", options, { fullResponse: true, params });
    return new OneToOneDMTimelineV2Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams: { ...options },
      sharedParams: params
    });
  }
  /**
   * Returns a list of Direct Messages within a conversation specified in the dm_conversation_id path parameter.
   * Messages are returned in reverse chronological order.
   *
   * OAuth 2 scopes: `dm.read`, `tweet.read`, `user.read`
   *
   * https://developer.x.com/en/docs/twitter-api/direct-messages/lookup/api-reference/get-dm_conversations-dm_conversation_id-dm_events
   */
  async listDmEventsOfConversation(dmConversationId, options = {}) {
    const params = { dm_conversation_id: dmConversationId };
    const initialRq = await this.get("dm_conversations/:dm_conversation_id/dm_events", options, { fullResponse: true, params });
    return new ConversationDMTimelineV2Paginator({
      realData: initialRq.data,
      rateLimit: initialRq.rateLimit,
      instance: this,
      queryParams: { ...options },
      sharedParams: params
    });
  }
  /* Spaces */
  /**
   * Get a single space by ID.
   * https://developer.x.com/en/docs/twitter-api/spaces/lookup/api-reference/get-spaces-id
   *
   * OAuth2 scopes: `tweet.read`, `users.read`, `space.read`.
   */
  space(spaceId, options = {}) {
    return this.get("spaces/:id", options, { params: { id: spaceId } });
  }
  /**
   * Get spaces using their IDs.
   * https://developer.x.com/en/docs/twitter-api/spaces/lookup/api-reference/get-spaces
   *
   * OAuth2 scopes: `tweet.read`, `users.read`, `space.read`.
   */
  spaces(spaceIds, options = {}) {
    return this.get("spaces", { ids: spaceIds, ...options });
  }
  /**
   * Get spaces using their creator user ID(s). (no pagination available)
   * https://developer.x.com/en/docs/twitter-api/spaces/lookup/api-reference/get-spaces-by-creator-ids
   *
   * OAuth2 scopes: `tweet.read`, `users.read`, `space.read`.
   */
  spacesByCreators(creatorIds, options = {}) {
    return this.get("spaces/by/creator_ids", { user_ids: creatorIds, ...options });
  }
  /**
   * Search through spaces using multiple params. (no pagination available)
   * https://developer.x.com/en/docs/twitter-api/spaces/search/api-reference/get-spaces-search
   */
  searchSpaces(options) {
    return this.get("spaces/search", options);
  }
  /**
  * Returns a list of user who purchased a ticket to the requested Space.
  * You must authenticate the request using the Access Token of the creator of the requested Space.
  *
  * **OAuth 2.0 Access Token required**
  *
  * https://developer.x.com/en/docs/twitter-api/spaces/lookup/api-reference/get-spaces-id-buyers
  *
  * OAuth2 scopes: `tweet.read`, `users.read`, `space.read`.
  */
  spaceBuyers(spaceId, options = {}) {
    return this.get("spaces/:id/buyers", options, { params: { id: spaceId } });
  }
  /**
   * Returns Tweets shared in the requested Spaces.
   * https://developer.x.com/en/docs/twitter-api/spaces/lookup/api-reference/get-spaces-id-tweets
   *
   * OAuth2 scope: `users.read`, `tweet.read`, `space.read`
   */
  spaceTweets(spaceId, options = {}) {
    return this.get("spaces/:id/tweets", options, { params: { id: spaceId } });
  }
  searchStream({ autoConnect, ...options } = {}) {
    return this.getStream("tweets/search/stream", options, { payloadIsError: isTweetStreamV2ErrorPayload, autoConnect });
  }
  /**
   * Return a list of rules currently active on the streaming endpoint, either as a list or individually.
   * https://developer.x.com/en/docs/twitter-api/tweets/filtered-stream/api-reference/get-tweets-search-stream-rules
   */
  streamRules(options = {}) {
    return this.get("tweets/search/stream/rules", options);
  }
  updateStreamRules(options, query = {}) {
    return this.post("tweets/search/stream/rules", options, { query });
  }
  sampleStream({ autoConnect, ...options } = {}) {
    return this.getStream("tweets/sample/stream", options, { payloadIsError: isTweetStreamV2ErrorPayload, autoConnect });
  }
  sample10Stream({ autoConnect, ...options } = {}) {
    return this.getStream("tweets/sample10/stream", options, { payloadIsError: isTweetStreamV2ErrorPayload, autoConnect });
  }
  /* Batch compliance */
  /**
   * Returns a list of recent compliance jobs.
   * https://developer.x.com/en/docs/twitter-api/compliance/batch-compliance/api-reference/get-compliance-jobs
   */
  complianceJobs(options) {
    return this.get("compliance/jobs", options);
  }
  /**
   * Get a single compliance job with the specified ID.
   * https://developer.x.com/en/docs/twitter-api/compliance/batch-compliance/api-reference/get-compliance-jobs-id
   */
  complianceJob(jobId) {
    return this.get("compliance/jobs/:id", void 0, { params: { id: jobId } });
  }
  /**
   * Creates a new compliance job for Tweet IDs or user IDs, send your file, await result and parse it into an array.
   * You can run one batch job at a time. Returns the created job, but **not the job result!**.
   *
   * You can obtain the result (**after job is completed**) with `.complianceJobResult`.
   * https://developer.x.com/en/docs/twitter-api/compliance/batch-compliance/api-reference/post-compliance-jobs
   */
  async sendComplianceJob(jobParams) {
    const job = await this.post("compliance/jobs", { type: jobParams.type, name: jobParams.name });
    const rawIdsBody = jobParams.ids instanceof Buffer ? jobParams.ids : Buffer.from(jobParams.ids.join("\n"));
    await this.put(job.data.upload_url, rawIdsBody, {
      forceBodyMode: "raw",
      enableAuth: false,
      headers: { "Content-Type": "text/plain" },
      prefix: ""
    });
    return job;
  }
  /**
   * Get the result of a running or completed job, obtained through `.complianceJob`, `.complianceJobs` or `.sendComplianceJob`.
   * If job is still running (`in_progress`), it will await until job is completed. **This could be quite long!**
   * https://developer.x.com/en/docs/twitter-api/compliance/batch-compliance/api-reference/post-compliance-jobs
   */
  async complianceJobResult(job) {
    let runningJob = job;
    while (runningJob.status !== "complete") {
      if (runningJob.status === "expired" || runningJob.status === "failed") {
        throw new Error("Job failed to be completed.");
      }
      await new Promise((resolve) => setTimeout(resolve, 3500));
      runningJob = (await this.complianceJob(job.id)).data;
    }
    const result = await this.get(job.download_url, void 0, {
      enableAuth: false,
      prefix: ""
    });
    return result.trim().split("\n").filter((line) => line).map((line) => JSON.parse(line));
  }
  /* Usage */
  /**
   * Allows you to retrieve your project usage.
   *
   * https://developer.x.com/en/docs/x-api/usage/tweets/introduction
   */
  async usage(options = {}) {
    return this.get("usage/tweets", options);
  }
  /**
   * Returns a variety of information about a single Community specified by ID.
   * https://docs.x.com/x-api/communities/communities-lookup-by-community-id
   */
  community(communityId, options = {}) {
    return this.get("communities/:id", options, { params: { id: communityId } });
  }
  /**
   * Search for Communities based on keywords.
   * https://docs.x.com/x-api/communities/search-communities
   */
  searchCommunities(query, options = {}) {
    return this.get("communities/search", { query, ...options });
  }
};

// node_modules/twitter-api-v2/dist/esm/v2-labs/client.v2.labs.write.js
var TwitterApiv2LabsReadWrite = class extends TwitterApiv2LabsReadOnly {
  constructor() {
    super(...arguments);
    this._prefix = API_V2_LABS_PREFIX;
  }
  /**
   * Get a client with only read rights.
   */
  get readOnly() {
    return this;
  }
};

// node_modules/twitter-api-v2/dist/esm/v2/client.v2.write.js
var TwitterApiv2ReadWrite = class extends TwitterApiv2ReadOnly {
  constructor() {
    super(...arguments);
    this._prefix = API_V2_PREFIX;
  }
  /* Sub-clients */
  /**
   * Get a client with only read rights.
   */
  get readOnly() {
    return this;
  }
  /**
   * Get a client for v2 labs endpoints.
   */
  get labs() {
    if (this._labs)
      return this._labs;
    return this._labs = new TwitterApiv2LabsReadWrite(this);
  }
  /* Tweets */
  /**
   * Hides or unhides a reply to a Tweet.
   * https://developer.x.com/en/docs/twitter-api/tweets/hide-replies/api-reference/put-tweets-id-hidden
   */
  hideReply(tweetId, makeHidden) {
    return this.put("tweets/:id/hidden", { hidden: makeHidden }, { params: { id: tweetId } });
  }
  /**
   * Causes the user ID identified in the path parameter to Like the target Tweet.
   * https://developer.x.com/en/docs/twitter-api/tweets/likes/api-reference/post-users-user_id-likes
   *
   * **Note**: You must specify the currently logged user ID ; you can obtain it through v1.1 API.
   */
  like(loggedUserId, targetTweetId) {
    return this.post("users/:id/likes", { tweet_id: targetTweetId }, { params: { id: loggedUserId } });
  }
  /**
   * Allows a user or authenticated user ID to unlike a Tweet.
   * The request succeeds with no action when the user sends a request to a user they're not liking the Tweet or have already unliked the Tweet.
   * https://developer.x.com/en/docs/twitter-api/tweets/likes/api-reference/delete-users-id-likes-tweet_id
   *
   * **Note**: You must specify the currently logged user ID ; you can obtain it through v1.1 API.
   */
  unlike(loggedUserId, targetTweetId) {
    return this.delete("users/:id/likes/:tweet_id", void 0, {
      params: { id: loggedUserId, tweet_id: targetTweetId }
    });
  }
  /**
   * Causes the user ID identified in the path parameter to Retweet the target Tweet.
   * https://developer.x.com/en/docs/twitter-api/tweets/retweets/api-reference/post-users-id-retweets
   *
   * **Note**: You must specify the currently logged user ID ; you can obtain it through v1.1 API.
   */
  retweet(loggedUserId, targetTweetId) {
    return this.post("users/:id/retweets", { tweet_id: targetTweetId }, { params: { id: loggedUserId } });
  }
  /**
   * Allows a user or authenticated user ID to remove the Retweet of a Tweet.
   * The request succeeds with no action when the user sends a request to a user they're not Retweeting the Tweet or have already removed the Retweet of.
   * https://developer.x.com/en/docs/twitter-api/tweets/retweets/api-reference/delete-users-id-retweets-tweet_id
   *
   * **Note**: You must specify the currently logged user ID ; you can obtain it through v1.1 API.
   */
  unretweet(loggedUserId, targetTweetId) {
    return this.delete("users/:id/retweets/:tweet_id", void 0, {
      params: { id: loggedUserId, tweet_id: targetTweetId }
    });
  }
  tweet(status, payload = {}) {
    if (typeof status === "object") {
      payload = status;
    } else {
      payload = { text: status, ...payload };
    }
    return this.post("tweets", payload);
  }
  /**
   * Uploads media to Twitter using chunked upload.
   * https://docs.x.com/x-api/media/media-upload
   *
   * @param media The media buffer to upload
   * @param options Upload options including media type and category, and additional owners
   * @param chunkSize Size of each chunk in bytes (default: 1MB)
   * @returns The media ID of the uploaded media
   */
  async uploadMedia(media, options, chunkSize = 1024 * 1024) {
    let media_category = options.media_category;
    if (!options.media_category) {
      if (options.media_type.includes("gif")) {
        media_category = "tweet_gif";
      } else if (options.media_type.includes("image")) {
        media_category = "tweet_image";
      } else if (options.media_type.includes("video")) {
        media_category = "tweet_video";
      }
    }
    const initArguments = {
      additional_owners: options.additional_owners,
      media_type: options.media_type,
      total_bytes: media.length,
      media_category
    };
    const initResponse = await this.post("media/upload/initialize", initArguments);
    const mediaId = initResponse.data.id;
    const chunksCount = Math.ceil(media.length / chunkSize);
    const mediaArray = new Uint8Array(media);
    for (let i = 0; i < chunksCount; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, media.length);
      const mediaChunk = mediaArray.slice(start, end);
      const chunkedBuffer = Buffer.from(mediaChunk);
      const appendArguments = {
        segment_index: i,
        media: chunkedBuffer
      };
      await this.post(`media/upload/${mediaId}/append`, appendArguments, { forceBodyMode: "form-data" });
    }
    const finalizeResponse = await this.post(`media/upload/${mediaId}/finalize`);
    if (finalizeResponse.data.processing_info) {
      await this.waitForMediaProcessing(mediaId);
    }
    return mediaId;
  }
  async waitForMediaProcessing(mediaId) {
    var _a;
    const response = await this.get("media/upload", {
      command: "STATUS",
      media_id: mediaId
    });
    const info = response.data.processing_info;
    if (!info)
      return;
    switch (info.state) {
      case "succeeded":
        return;
      case "failed":
        throw new Error(`Media processing failed: ${(_a = info.error) === null || _a === void 0 ? void 0 : _a.message}`);
      case "pending":
      case "in_progress": {
        const waitTime = info === null || info === void 0 ? void 0 : info.check_after_secs;
        if (waitTime && waitTime > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitTime * 1e3));
          await this.waitForMediaProcessing(mediaId);
        }
      }
    }
  }
  /**
   * Creates the metadata for media to be uploaded.
   * This feature is currently only supported for images and GIFs.
   * https://docs.x.com/x-api/media/metadata-create
   */
  createMediaMetadata(mediaId, metadata) {
    return this.post("media/metadata", { id: mediaId, metadata });
  }
  /**
   * Reply to a Tweet on behalf of an authenticated user.
   * https://developer.x.com/en/docs/twitter-api/tweets/manage-tweets/api-reference/post-tweets
   */
  reply(status, toTweetId, payload = {}) {
    var _a;
    const reply = { in_reply_to_tweet_id: toTweetId, ...(_a = payload.reply) !== null && _a !== void 0 ? _a : {} };
    return this.post("tweets", { text: status, ...payload, reply });
  }
  /**
   * Quote an existing Tweet on behalf of an authenticated user.
   * https://developer.x.com/en/docs/twitter-api/tweets/manage-tweets/api-reference/post-tweets
   */
  quote(status, quotedTweetId, payload = {}) {
    return this.tweet(status, { ...payload, quote_tweet_id: quotedTweetId });
  }
  /**
   * Post a series of tweets.
   * https://developer.x.com/en/docs/twitter-api/tweets/manage-tweets/api-reference/post-tweets
   */
  async tweetThread(tweets) {
    var _a, _b;
    const postedTweets = [];
    for (const tweet of tweets) {
      const lastTweet = postedTweets.length ? postedTweets[postedTweets.length - 1] : null;
      const queryParams = { ...typeof tweet === "string" ? { text: tweet } : tweet };
      const inReplyToId = lastTweet ? lastTweet.data.id : (_a = queryParams.reply) === null || _a === void 0 ? void 0 : _a.in_reply_to_tweet_id;
      const status = (_b = queryParams.text) !== null && _b !== void 0 ? _b : "";
      if (inReplyToId) {
        postedTweets.push(await this.reply(status, inReplyToId, queryParams));
      } else {
        postedTweets.push(await this.tweet(status, queryParams));
      }
    }
    return postedTweets;
  }
  /**
   * Allows a user or authenticated user ID to delete a Tweet
   * https://developer.x.com/en/docs/twitter-api/tweets/manage-tweets/api-reference/delete-tweets-id
   */
  deleteTweet(tweetId) {
    return this.delete("tweets/:id", void 0, {
      params: {
        id: tweetId
      }
    });
  }
  /* Bookmarks */
  /**
   * Causes the user ID of an authenticated user identified in the path parameter to Bookmark the target Tweet provided in the request body.
   * https://developer.x.com/en/docs/twitter-api/tweets/bookmarks/api-reference/post-users-id-bookmarks
   *
   * OAuth2 scopes: `users.read` `tweet.read` `bookmark.write`
   */
  async bookmark(tweetId) {
    const user = await this.getCurrentUserV2Object();
    return this.post("users/:id/bookmarks", { tweet_id: tweetId }, { params: { id: user.data.id } });
  }
  /**
   * Allows a user or authenticated user ID to remove a Bookmark of a Tweet.
   * https://developer.x.com/en/docs/twitter-api/tweets/bookmarks/api-reference/delete-users-id-bookmarks-tweet_id
   *
   * OAuth2 scopes: `users.read` `tweet.read` `bookmark.write`
   */
  async deleteBookmark(tweetId) {
    const user = await this.getCurrentUserV2Object();
    return this.delete("users/:id/bookmarks/:tweet_id", void 0, { params: { id: user.data.id, tweet_id: tweetId } });
  }
  /* Users */
  /**
   * Allows a user ID to follow another user.
   * If the target user does not have public Tweets, this endpoint will send a follow request.
   * https://developer.x.com/en/docs/twitter-api/users/follows/api-reference/post-users-source_user_id-following
   *
   * OAuth2 scope: `follows.write`
   *
   * **Note**: You must specify the currently logged user ID ; you can obtain it through v1.1 API.
   */
  follow(loggedUserId, targetUserId) {
    return this.post("users/:id/following", { target_user_id: targetUserId }, { params: { id: loggedUserId } });
  }
  /**
   * Allows a user ID to unfollow another user.
   * https://developer.x.com/en/docs/twitter-api/users/follows/api-reference/delete-users-source_id-following
   *
   * OAuth2 scope: `follows.write`
   *
   * **Note**: You must specify the currently logged user ID ; you can obtain it through v1.1 API.
   */
  unfollow(loggedUserId, targetUserId) {
    return this.delete("users/:source_user_id/following/:target_user_id", void 0, {
      params: { source_user_id: loggedUserId, target_user_id: targetUserId }
    });
  }
  /**
   * Causes the user (in the path) to block the target user.
   * The user (in the path) must match the user context authorizing the request.
   * https://developer.x.com/en/docs/twitter-api/users/blocks/api-reference/post-users-user_id-blocking
   *
   * **Note**: You must specify the currently logged user ID; you can obtain it through v1.1 API.
   */
  block(loggedUserId, targetUserId) {
    return this.post("users/:id/blocking", { target_user_id: targetUserId }, { params: { id: loggedUserId } });
  }
  /**
   * Allows a user or authenticated user ID to unblock another user.
   * https://developer.x.com/en/docs/twitter-api/users/blocks/api-reference/delete-users-user_id-blocking
   *
   * **Note**: You must specify the currently logged user ID ; you can obtain it through v1.1 API.
   */
  unblock(loggedUserId, targetUserId) {
    return this.delete("users/:source_user_id/blocking/:target_user_id", void 0, {
      params: { source_user_id: loggedUserId, target_user_id: targetUserId }
    });
  }
  /**
   * Allows an authenticated user ID to mute the target user.
   * https://developer.x.com/en/docs/twitter-api/users/mutes/api-reference/post-users-user_id-muting
   *
   * **Note**: You must specify the currently logged user ID ; you can obtain it through v1.1 API.
   */
  mute(loggedUserId, targetUserId) {
    return this.post("users/:id/muting", { target_user_id: targetUserId }, { params: { id: loggedUserId } });
  }
  /**
   * Allows an authenticated user ID to unmute the target user.
   * The request succeeds with no action when the user sends a request to a user they're not muting or have already unmuted.
   * https://developer.x.com/en/docs/twitter-api/users/mutes/api-reference/delete-users-user_id-muting
   *
   * **Note**: You must specify the currently logged user ID ; you can obtain it through v1.1 API.
   */
  unmute(loggedUserId, targetUserId) {
    return this.delete("users/:source_user_id/muting/:target_user_id", void 0, {
      params: { source_user_id: loggedUserId, target_user_id: targetUserId }
    });
  }
  /* Lists */
  /**
   * Creates a new list for the authenticated user.
   * https://developer.x.com/en/docs/twitter-api/lists/manage-lists/api-reference/post-lists
   */
  createList(options) {
    return this.post("lists", options);
  }
  /**
   * Updates the specified list. The authenticated user must own the list to be able to update it.
   * https://developer.x.com/en/docs/twitter-api/lists/manage-lists/api-reference/put-lists-id
   */
  updateList(listId, options = {}) {
    return this.put("lists/:id", options, { params: { id: listId } });
  }
  /**
   * Deletes the specified list. The authenticated user must own the list to be able to destroy it.
   * https://developer.x.com/en/docs/twitter-api/lists/manage-lists/api-reference/delete-lists-id
   */
  removeList(listId) {
    return this.delete("lists/:id", void 0, { params: { id: listId } });
  }
  /**
   * Adds a member to a list.
   * https://developer.x.com/en/docs/twitter-api/lists/list-members/api-reference/post-lists-id-members
   */
  addListMember(listId, userId) {
    return this.post("lists/:id/members", { user_id: userId }, { params: { id: listId } });
  }
  /**
   * Remember a member to a list.
   * https://developer.x.com/en/docs/twitter-api/lists/list-members/api-reference/delete-lists-id-members-user_id
   */
  removeListMember(listId, userId) {
    return this.delete("lists/:id/members/:user_id", void 0, { params: { id: listId, user_id: userId } });
  }
  /**
   * Subscribes the authenticated user to the specified list.
   * https://developer.x.com/en/docs/twitter-api/lists/manage-lists/api-reference/post-users-id-followed-lists
   */
  subscribeToList(loggedUserId, listId) {
    return this.post("users/:id/followed_lists", { list_id: listId }, { params: { id: loggedUserId } });
  }
  /**
   * Unsubscribes the authenticated user to the specified list.
   * https://developer.x.com/en/docs/twitter-api/lists/manage-lists/api-reference/delete-users-id-followed-lists-list_id
   */
  unsubscribeOfList(loggedUserId, listId) {
    return this.delete("users/:id/followed_lists/:list_id", void 0, { params: { id: loggedUserId, list_id: listId } });
  }
  /**
   * Enables the authenticated user to pin a List.
   * https://developer.x.com/en/docs/twitter-api/lists/manage-lists/api-reference/post-users-id-pinned-lists
   */
  pinList(loggedUserId, listId) {
    return this.post("users/:id/pinned_lists", { list_id: listId }, { params: { id: loggedUserId } });
  }
  /**
   * Enables the authenticated user to unpin a List.
   * https://developer.x.com/en/docs/twitter-api/lists/manage-lists/api-reference/delete-users-id-pinned-lists-list_id
   */
  unpinList(loggedUserId, listId) {
    return this.delete("users/:id/pinned_lists/:list_id", void 0, { params: { id: loggedUserId, list_id: listId } });
  }
  /* Direct messages */
  /**
   * Creates a Direct Message on behalf of an authenticated user, and adds it to the specified conversation.
   * https://developer.x.com/en/docs/twitter-api/direct-messages/manage/api-reference/post-dm_conversations-dm_conversation_id-messages
   */
  sendDmInConversation(conversationId, message) {
    return this.post("dm_conversations/:dm_conversation_id/messages", message, { params: { dm_conversation_id: conversationId } });
  }
  /**
   * Creates a one-to-one Direct Message and adds it to the one-to-one conversation.
   * This method either creates a new one-to-one conversation or retrieves the current conversation and adds the Direct Message to it.
   * https://developer.x.com/en/docs/twitter-api/direct-messages/manage/api-reference/post-dm_conversations-with-participant_id-messages
   */
  sendDmToParticipant(participantId, message) {
    return this.post("dm_conversations/with/:participant_id/messages", message, { params: { participant_id: participantId } });
  }
  /**
   * Creates a new group conversation and adds a Direct Message to it on behalf of an authenticated user.
   * https://developer.x.com/en/docs/twitter-api/direct-messages/manage/api-reference/post-dm_conversations
   */
  createDmConversation(options) {
    return this.post("dm_conversations", options);
  }
};

// node_modules/twitter-api-v2/dist/esm/v2-labs/client.v2.labs.js
var TwitterApiv2Labs = class extends TwitterApiv2LabsReadWrite {
  constructor() {
    super(...arguments);
    this._prefix = API_V2_LABS_PREFIX;
  }
  /**
   * Get a client with read/write rights.
   */
  get readWrite() {
    return this;
  }
};
var client_v2_labs_default = TwitterApiv2Labs;

// node_modules/twitter-api-v2/dist/esm/v2/client.v2.js
var TwitterApiv2 = class extends TwitterApiv2ReadWrite {
  constructor() {
    super(...arguments);
    this._prefix = API_V2_PREFIX;
  }
  /* Sub-clients */
  /**
   * Get a client with read/write rights.
   */
  get readWrite() {
    return this;
  }
  /**
   * Get a client for v2 labs endpoints.
   */
  get labs() {
    if (this._labs)
      return this._labs;
    return this._labs = new client_v2_labs_default(this);
  }
};
var client_v2_default = TwitterApiv2;

// node_modules/twitter-api-v2/dist/esm/client/readonly.js
var TwitterApiReadOnly = class extends TwitterApiBase {
  /* Direct access to subclients */
  get v1() {
    if (this._v1)
      return this._v1;
    return this._v1 = new TwitterApiv1ReadOnly(this);
  }
  get v2() {
    if (this._v2)
      return this._v2;
    return this._v2 = new TwitterApiv2ReadOnly(this);
  }
  /**
   * Fetch and cache current user.
   * This method can only be called with a OAuth 1.0a user authentication.
   *
   * You can use this method to test if authentication was successful.
   * Next calls to this methods will use the cached user, unless `forceFetch: true` is given.
   */
  async currentUser(forceFetch = false) {
    return await this.getCurrentUserObject(forceFetch);
  }
  /**
   * Fetch and cache current user.
   * This method can only be called with a OAuth 1.0a or OAuth2 user authentication.
   *
   * This can only be the slimest available `UserV2` object, with only id, name and username properties defined.
   * To get a customized `UserV2Result`, use `.v2.me()`
   *
   * You can use this method to test if authentication was successful.
   * Next calls to this methods will use the cached user, unless `forceFetch: true` is given.
   *
   * OAuth2 scopes: `tweet.read` & `users.read`
   */
  async currentUserV2(forceFetch = false) {
    return await this.getCurrentUserV2Object(forceFetch);
  }
  /* Shortcuts to endpoints */
  search(what, options) {
    return this.v2.search(what, options);
  }
  /* Authentication */
  /**
   * Generate the OAuth request token link for user-based OAuth 1.0 auth.
   *
   * ```ts
   * // Instantiate TwitterApi with consumer keys
   * const client = new TwitterApi({ appKey: 'consumer_key', appSecret: 'consumer_secret' });
   *
   * const tokenRequest = await client.generateAuthLink('oob-or-your-callback-url');
   * // redirect end-user to tokenRequest.url
   *
   * // Save tokenRequest.oauth_token_secret somewhere, it will be needed for next auth step.
   * ```
   */
  async generateAuthLink(oauth_callback = "oob", { authAccessType, linkMode = "authenticate", forceLogin, screenName } = {}) {
    const oauthResult = await this.post("https://api.x.com/oauth/request_token", { oauth_callback, x_auth_access_type: authAccessType });
    let url = `https://api.x.com/oauth/${linkMode}?oauth_token=${encodeURIComponent(oauthResult.oauth_token)}`;
    if (forceLogin !== void 0) {
      url += `&force_login=${encodeURIComponent(forceLogin)}`;
    }
    if (screenName !== void 0) {
      url += `&screen_name=${encodeURIComponent(screenName)}`;
    }
    if (this._requestMaker.hasPlugins()) {
      this._requestMaker.applyPluginMethod("onOAuth1RequestToken", {
        client: this._requestMaker,
        url,
        oauthResult
      });
    }
    return {
      url,
      ...oauthResult
    };
  }
  /**
   * Obtain access to user-based OAuth 1.0 auth.
   *
   * After user is redirect from your callback, use obtained oauth_token and oauth_verifier to
   * instantiate the new TwitterApi instance.
   *
   * ```ts
   * // Use the saved oauth_token_secret associated to oauth_token returned by callback
   * const requestClient = new TwitterApi({
   *  appKey: 'consumer_key',
   *  appSecret: 'consumer_secret',
   *  accessToken: 'oauth_token',
   *  accessSecret: 'oauth_token_secret'
   * });
   *
   * // Use oauth_verifier obtained from callback request
   * const { client: userClient } = await requestClient.login('oauth_verifier');
   *
   * // {userClient} is a valid {TwitterApi} object you can use for future requests
   * ```
   */
  async login(oauth_verifier) {
    const tokens = this.getActiveTokens();
    if (tokens.type !== "oauth-1.0a")
      throw new Error("You must setup TwitterApi instance with consumer keys to accept OAuth 1.0 login");
    const oauth_result = await this.post("https://api.x.com/oauth/access_token", { oauth_token: tokens.accessToken, oauth_verifier });
    const client = new this.constructor({
      appKey: tokens.appKey,
      appSecret: tokens.appSecret,
      accessToken: oauth_result.oauth_token,
      accessSecret: oauth_result.oauth_token_secret
    }, this._requestMaker.clientSettings);
    return {
      accessToken: oauth_result.oauth_token,
      accessSecret: oauth_result.oauth_token_secret,
      userId: oauth_result.user_id,
      screenName: oauth_result.screen_name,
      client
    };
  }
  /**
   * Enable application-only authentication.
   *
   * To make the request, instantiate TwitterApi with consumer and secret.
   *
   * ```ts
   * const requestClient = new TwitterApi({ appKey: 'consumer', appSecret: 'secret' });
   * const appClient = await requestClient.appLogin();
   *
   * // Use {appClient} to make requests
   * ```
   */
  async appLogin() {
    const tokens = this.getActiveTokens();
    if (tokens.type !== "oauth-1.0a")
      throw new Error("You must setup TwitterApi instance with consumer keys to accept app-only login");
    const basicClient = new this.constructor({ username: tokens.appKey, password: tokens.appSecret }, this._requestMaker.clientSettings);
    const res = await basicClient.post("https://api.x.com/oauth2/token", { grant_type: "client_credentials" });
    return new this.constructor(res.access_token, this._requestMaker.clientSettings);
  }
  /* OAuth 2 user authentication */
  /**
   * Generate the OAuth request token link for user-based OAuth 2.0 auth.
   *
   * - **You can only use v2 API endpoints with this authentication method.**
   * - **You need to specify which scope you want to have when you create your auth link. Make sure it matches your needs.**
   *
   * See https://developer.x.com/en/docs/authentication/oauth-2-0/user-access-token for details.
   *
   * ```ts
   * // Instantiate TwitterApi with client ID
   * const client = new TwitterApi({ clientId: 'yourClientId' });
   *
   * // Generate a link to callback URL that will gives a token with tweet+user read access
   * const link = client.generateOAuth2AuthLink('your-callback-url', { scope: ['tweet.read', 'users.read'] });
   *
   * // Extract props from generate link
   * const { url, state, codeVerifier } = link;
   *
   * // redirect end-user to url
   * // Save `state` and `codeVerifier` somewhere, it will be needed for next auth step.
   * ```
   */
  generateOAuth2AuthLink(redirectUri, options = {}) {
    var _a, _b;
    if (!this._requestMaker.clientId) {
      throw new Error("Twitter API instance is not initialized with client ID. You can find your client ID in Twitter Developer Portal. Please build an instance with: new TwitterApi({ clientId: '<yourClientId>' })");
    }
    const state = (_a = options.state) !== null && _a !== void 0 ? _a : OAuth2Helper.generateRandomString(32);
    const codeVerifier = OAuth2Helper.getCodeVerifier();
    const codeChallenge = OAuth2Helper.getCodeChallengeFromVerifier(codeVerifier);
    const rawScope = (_b = options.scope) !== null && _b !== void 0 ? _b : "";
    const scope = Array.isArray(rawScope) ? rawScope.join(" ") : rawScope;
    const url = new URL("https://x.com/i/oauth2/authorize");
    const query = {
      response_type: "code",
      client_id: this._requestMaker.clientId,
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "s256",
      scope
    };
    request_param_helper_default.addQueryParamsToUrl(url, query);
    const result = {
      url: url.toString(),
      state,
      codeVerifier,
      codeChallenge
    };
    if (this._requestMaker.hasPlugins()) {
      this._requestMaker.applyPluginMethod("onOAuth2RequestToken", {
        client: this._requestMaker,
        result,
        redirectUri
      });
    }
    return result;
  }
  /**
   * Obtain access to user-based OAuth 2.0 auth.
   *
   * After user is redirect from your callback, use obtained code to
   * instantiate the new TwitterApi instance.
   *
   * You need to obtain `codeVerifier` from a call to `.generateOAuth2AuthLink`.
   *
   * ```ts
   * // Use the saved codeVerifier associated to state (present in query string of callback)
   * const requestClient = new TwitterApi({ clientId: 'yourClientId' });
   *
   * const { client: userClient, refreshToken } = await requestClient.loginWithOAuth2({
   *  code: 'codeFromQueryString',
   *  // the same URL given to generateOAuth2AuthLink
   *  redirectUri,
   *  // the verifier returned by generateOAuth2AuthLink
   *  codeVerifier,
   * });
   *
   * // {userClient} is a valid {TwitterApi} object you can use for future requests
   * // {refreshToken} is defined if 'offline.access' is in scope.
   * ```
   */
  async loginWithOAuth2({ code, codeVerifier, redirectUri }) {
    if (!this._requestMaker.clientId) {
      throw new Error("Twitter API instance is not initialized with client ID. Please build an instance with: new TwitterApi({ clientId: '<yourClientId>' })");
    }
    const accessTokenResult = await this.post("https://api.x.com/2/oauth2/token", {
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      client_id: this._requestMaker.clientId,
      client_secret: this._requestMaker.clientSecret
    });
    return this.parseOAuth2AccessTokenResult(accessTokenResult);
  }
  /**
   * Obtain a new access token to user-based OAuth 2.0 auth from a refresh token.
   *
   * ```ts
   * const requestClient = new TwitterApi({ clientId: 'yourClientId' });
   *
   * const { client: userClient } = await requestClient.refreshOAuth2Token('refreshToken');
   * // {userClient} is a valid {TwitterApi} object you can use for future requests
   * ```
   */
  async refreshOAuth2Token(refreshToken) {
    if (!this._requestMaker.clientId) {
      throw new Error("Twitter API instance is not initialized with client ID. Please build an instance with: new TwitterApi({ clientId: '<yourClientId>' })");
    }
    const accessTokenResult = await this.post("https://api.x.com/2/oauth2/token", {
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      client_id: this._requestMaker.clientId,
      client_secret: this._requestMaker.clientSecret
    });
    return this.parseOAuth2AccessTokenResult(accessTokenResult);
  }
  /**
   * Revoke a single user-based OAuth 2.0 token.
   *
   * You must specify its source, access token (directly after login)
   * or refresh token (if you've called `.refreshOAuth2Token` before).
   */
  async revokeOAuth2Token(token, tokenType = "access_token") {
    if (!this._requestMaker.clientId) {
      throw new Error("Twitter API instance is not initialized with client ID. Please build an instance with: new TwitterApi({ clientId: '<yourClientId>' })");
    }
    return await this.post("https://api.x.com/2/oauth2/revoke", {
      client_id: this._requestMaker.clientId,
      client_secret: this._requestMaker.clientSecret,
      token,
      token_type_hint: tokenType
    });
  }
  parseOAuth2AccessTokenResult(result) {
    const client = new this.constructor(result.access_token, this._requestMaker.clientSettings);
    const scope = result.scope.split(" ").filter((e) => e);
    return {
      client,
      expiresIn: result.expires_in,
      accessToken: result.access_token,
      scope,
      refreshToken: result.refresh_token
    };
  }
};

// node_modules/twitter-api-v2/dist/esm/client/readwrite.js
var TwitterApiReadWrite = class extends TwitterApiReadOnly {
  /* Direct access to subclients */
  get v1() {
    if (this._v1)
      return this._v1;
    return this._v1 = new TwitterApiv1ReadWrite(this);
  }
  get v2() {
    if (this._v2)
      return this._v2;
    return this._v2 = new TwitterApiv2ReadWrite(this);
  }
  /**
   * Get a client with read only rights.
   */
  get readOnly() {
    return this;
  }
};

// node_modules/twitter-api-v2/dist/esm/ads/client.ads.read.js
var TwitterAdsReadOnly = class extends TwitterApiSubClient {
  constructor() {
    super(...arguments);
    this._prefix = API_ADS_PREFIX;
  }
};

// node_modules/twitter-api-v2/dist/esm/ads/client.ads.write.js
var TwitterAdsReadWrite = class extends TwitterAdsReadOnly {
  constructor() {
    super(...arguments);
    this._prefix = API_ADS_PREFIX;
  }
  /**
   * Get a client with only read rights.
   */
  get readOnly() {
    return this;
  }
};

// node_modules/twitter-api-v2/dist/esm/ads-sandbox/client.ads-sandbox.read.js
var TwitterAdsSandboxReadOnly = class extends TwitterApiSubClient {
  constructor() {
    super(...arguments);
    this._prefix = API_ADS_SANDBOX_PREFIX;
  }
};

// node_modules/twitter-api-v2/dist/esm/ads-sandbox/client.ads-sandbox.write.js
var TwitterAdsSandboxReadWrite = class extends TwitterAdsSandboxReadOnly {
  constructor() {
    super(...arguments);
    this._prefix = API_ADS_SANDBOX_PREFIX;
  }
  /**
   * Get a client with only read rights.
   */
  get readOnly() {
    return this;
  }
};

// node_modules/twitter-api-v2/dist/esm/ads-sandbox/client.ads-sandbox.js
var TwitterAdsSandbox = class extends TwitterAdsSandboxReadWrite {
  constructor() {
    super(...arguments);
    this._prefix = API_ADS_SANDBOX_PREFIX;
  }
  /**
   * Get a client with read/write rights.
   */
  get readWrite() {
    return this;
  }
};
var client_ads_sandbox_default = TwitterAdsSandbox;

// node_modules/twitter-api-v2/dist/esm/ads/client.ads.js
var TwitterAds = class extends TwitterAdsReadWrite {
  constructor() {
    super(...arguments);
    this._prefix = API_ADS_PREFIX;
  }
  /**
   * Get a client with read/write rights.
   */
  get readWrite() {
    return this;
  }
  /**
   * Get Twitter Ads Sandbox API client
   */
  get sandbox() {
    if (this._sandbox)
      return this._sandbox;
    return this._sandbox = new client_ads_sandbox_default(this);
  }
};
var client_ads_default = TwitterAds;

// node_modules/twitter-api-v2/dist/esm/client/index.js
var TwitterApi = class extends TwitterApiReadWrite {
  /* Direct access to subclients */
  get v1() {
    if (this._v1)
      return this._v1;
    return this._v1 = new client_v1_default(this);
  }
  get v2() {
    if (this._v2)
      return this._v2;
    return this._v2 = new client_v2_default(this);
  }
  /**
   * Get a client with read/write rights.
   */
  get readWrite() {
    return this;
  }
  /**
   * Get Twitter Ads API client
   */
  get ads() {
    if (this._ads)
      return this._ads;
    return this._ads = new client_ads_default(this);
  }
  /* Static helpers */
  static getErrors(error) {
    var _a;
    if (typeof error !== "object")
      return [];
    if (!("data" in error))
      return [];
    return (_a = error.data.errors) !== null && _a !== void 0 ? _a : [];
  }
  /** Extract another image size than obtained in a `profile_image_url` or `profile_image_url_https` field of a user object. */
  static getProfileImageInSize(profileImageUrl, size) {
    const lastPart = profileImageUrl.split("/").pop();
    const sizes = ["normal", "bigger", "mini"];
    let originalUrl = profileImageUrl;
    for (const availableSize of sizes) {
      if (lastPart.includes(`_${availableSize}`)) {
        originalUrl = profileImageUrl.replace(`_${availableSize}`, "");
        break;
      }
    }
    if (size === "original") {
      return originalUrl;
    }
    const extPos = originalUrl.lastIndexOf(".");
    if (extPos !== -1) {
      const ext = originalUrl.slice(extPos + 1);
      return originalUrl.slice(0, extPos) + "_" + size + "." + ext;
    } else {
      return originalUrl + "_" + size;
    }
  }
};

// src/twitter/client.ts
function getTwitterClient() {
  const appKey = process.env.TWITTER_API_KEY;
  const appSecret = process.env.TWITTER_API_KEY_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;
  if (!appKey || !appSecret || !accessToken || !accessSecret) return void 0;
  return new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
}

// src/twitter/lifecycle.ts
async function postTweet(client, text) {
  if (!client) return null;
  try {
    const { data } = await client.v2.tweet(text);
    return data?.id ?? null;
  } catch (err) {
    const code = err?.code ?? err?.status ?? "unknown";
    const title = err?.data?.title ?? err?.title ?? "";
    console.warn(`[twitter] tweet failed (${code}) ${title}`);
    return null;
  }
}
async function deleteTweet(client, id) {
  if (!client) return false;
  try {
    const { data } = await client.v2.deleteTweet(id);
    return Boolean(data?.deleted);
  } catch {
    return false;
  }
}

// src/cli/sync-shard.ts
async function main() {
  const shardArgIndex = process.argv.indexOf("--shard");
  let shardId = 0;
  if (shardArgIndex !== -1) {
    const shardValue = process.argv[shardArgIndex + 1];
    if (shardValue === void 0 || shardValue.startsWith("--") || isNaN(Number(shardValue))) {
      console.error("Error: --shard must be followed by a valid number.");
      process.exit(1);
    }
    shardId = Number(shardValue);
  }
  const outDir = `out`;
  const directoryOwner = process.env.DIRECTORY_OWNER ?? "";
  const directoryRepo = process.env.DIRECTORY_REPO ?? "";
  let repos = [];
  try {
    const plan = JSON.parse(fs4__default.readFileSync("plan.json", "utf8"));
    const entry = (plan?.matrix?.include ?? []).find((e) => e.shard_id === shardId);
    if (entry?.repos) repos = entry.repos;
  } catch {
  }
  const octokit = getOctokit();
  const indexPath = "index.json";
  const twitterMapPath = "twitter-map.json";
  const index = fs4__default.existsSync(indexPath) ? JSON.parse(fs4__default.readFileSync(indexPath, "utf8")) : {};
  const twitterMap = fs4__default.existsSync(twitterMapPath) ? JSON.parse(fs4__default.readFileSync(twitterMapPath, "utf8")) : {};
  const res = await syncShard(octokit, { repos, directoryOwner, directoryRepo, index });
  const tweetOnCreate = process.env.TWEET_ON_CREATE !== "false";
  const deleteOnComplete = process.env.DELETE_TWEET_ON_COMPLETE !== "false";
  const dryRun = process.env.DRY_RUN === "true";
  const client = getTwitterClient();
  const creates = {};
  const deletes = [];
  for (const issue of res.issues) {
    const nodeId = issue.node_id;
    const priceLabel = issue.labels.find((l) => l.startsWith("Price:"));
    const timeLabel = issue.labels.find((l) => l.startsWith("Time:"));
    const text = priceLabel ? `${priceLabel.replace(/^Price:\s*/, "")} for ${timeLabel?.replace(/^Time:\s*/, "") ?? "this task"}

${issue.url}` : null;
    if (issue.state === "open" && tweetOnCreate && text && !twitterMap[nodeId]) {
      if (!dryRun) {
        const id = await postTweet(client, text);
        if (id) creates[nodeId] = id;
      }
    }
    if (issue.state === "closed" && deleteOnComplete && twitterMap[nodeId]) {
      if (!dryRun) {
        const ok = await deleteTweet(client, twitterMap[nodeId]);
        if (ok) deletes.push(nodeId);
      }
    }
  }
  writeJson(outDir, `shard-${shardId}-issues.json`, res.issues);
  writeJson(outDir, `shard-${shardId}-prs.json`, res.prs);
  writeJson(outDir, `shard-${shardId}-mirror-state.json`, res.mirrorState);
  writeJson(outDir, `shard-${shardId}-owners.json`, res.owners);
  const twitterDelta = Object.keys(creates).length || deletes.length ? { creates, deletes } : {};
  writeJson(outDir, `shard-${shardId}-twitter-delta.json`, twitterDelta);
  writeJson(outDir, `shard-${shardId}-sync-meta.json`, res.syncMeta);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
//# sourceMappingURL=sync-shard.js.map
//# sourceMappingURL=sync-shard.js.map