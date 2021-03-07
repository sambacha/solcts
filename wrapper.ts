// @ts-expect-error ts-migrate(2300) FIXME: Duplicate identifier 'assert'.
var assert = require('assert');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'translate'... Remove this comment to see the full error message
var translate = require('./translate.js');
var requireFromString = require('require-from-string');
var https = require('follow-redirects').https;
var MemoryStream = require('memorystream');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'semver'.
var semver = require('semver');

function setupMethods (soljson: any) {
  var version: any;
  if ('_solidity_version' in soljson) {
    version = soljson.cwrap('solidity_version', 'string', []);
  } else {
    version = soljson.cwrap('version', 'string', []);
  }

  var versionToSemver = function () {
    return translate.versionToSemver(version());
  };

  var isVersion6 = semver.gt(versionToSemver(), '0.5.99');

  var license;
  if ('_solidity_license' in soljson) {
    license = soljson.cwrap('solidity_license', 'string', []);
  } else if ('_license' in soljson) {
    license = soljson.cwrap('license', 'string', []);
  } else {
    // pre 0.4.14
    license = function () {
      // return undefined
    };
  }

  var alloc: any;
  if ('_solidity_alloc' in soljson) {
    alloc = soljson.cwrap('solidity_alloc', 'number', [ 'number' ]);
  } else {
    alloc = soljson._malloc;
    assert(alloc, 'Expected malloc to be present.');
  }

  var reset: any;
  if ('_solidity_reset' in soljson) {
    reset = soljson.cwrap('solidity_reset', null, []);
  }

  var copyToCString = function (str: any, ptr: any) {
    var length = soljson.lengthBytesUTF8(str);
    // This is allocating memory using solc's allocator.
    //
    // Before 0.6.0:
    //   Assuming copyToCString is only used in the context of wrapCallback, solc will free these pointers.
    //   See https://github.com/ethereum/solidity/blob/v0.5.13/libsolc/libsolc.h#L37-L40
    //
    // After 0.6.0:
    //   The duty is on solc-js to free these pointers. We accomplish that by calling `reset` at the end.
    var buffer = alloc(length + 1);
    soljson.stringToUTF8(str, buffer, length + 1);
    soljson.setValue(ptr, buffer, '*');
  };

  // This is to support multiple versions of Emscripten.
  // Take a single `ptr` and returns a `str`.
  var copyFromCString = soljson.UTF8ToString || soljson.Pointer_stringify;

  var wrapCallback = function (callback: any) {
    assert(typeof callback === 'function', 'Invalid callback specified.');
    return function (data: any, contents: any, error: any) {
      var result = callback(copyFromCString(data));
      if (typeof result.contents === 'string') {
        copyToCString(result.contents, contents);
      }
      if (typeof result.error === 'string') {
        copyToCString(result.error, error);
      }
    };
  };

  var wrapCallbackWithKind = function (callback: any) {
    assert(typeof callback === 'function', 'Invalid callback specified.');
    return function (context: any, kind: any, data: any, contents: any, error: any) {
      // Must be a null pointer.
      assert(context === 0, 'Callback context must be null.');
      var result = callback(copyFromCString(kind), copyFromCString(data));
      if (typeof result.contents === 'string') {
        copyToCString(result.contents, contents);
      }
      if (typeof result.error === 'string') {
        copyToCString(result.error, error);
      }
    };
  };

  // This calls compile() with args || cb
  var runWithCallbacks = function (callbacks: any, compile: any, args: any) {
    if (callbacks) {
      assert(typeof callbacks === 'object', 'Invalid callback object specified.');
    } else {
      callbacks = {};
    }

    var readCallback = callbacks.import;
    if (readCallback === undefined) {
      readCallback = function (data: any) {
        return {
          error: 'File import callback not supported'
        };
      };
    }

    var singleCallback;
    if (isVersion6) {
      // After 0.6.x multiple kind of callbacks are supported.
      var smtSolverCallback = callbacks.smtSolver;
      if (smtSolverCallback === undefined) {
        smtSolverCallback = function (data: any) {
          return {
            error: 'SMT solver callback not supported'
          };
        };
      }

      singleCallback = function (kind: any, data: any) {
        if (kind === 'source') {
          return readCallback(data);
        } else if (kind === 'smt-query') {
          return smtSolverCallback(data);
        } else {
          assert(false, 'Invalid callback kind specified.');
        }
      };

      singleCallback = wrapCallbackWithKind(singleCallback);
    } else {
      // Old Solidity version only supported imports.
      singleCallback = wrapCallback(readCallback);
    }

    // This is to support multiple versions of Emscripten.
    var addFunction = soljson.addFunction || soljson.Runtime.addFunction;
    var removeFunction = soljson.removeFunction || soljson.Runtime.removeFunction;

    var cb = addFunction(singleCallback, 'viiiii');
    var output;
    try {
      args.push(cb);
      if (isVersion6) {
        // Callback context.
        args.push(null);
      }
      output = compile.apply(undefined, args);
    } catch (e) {
      removeFunction(cb);
      throw e;
    }
    removeFunction(cb);
    if (reset) {
      // Explicitly free memory.
      //
      // NOTE: cwrap() of "compile" will copy the returned pointer into a
      //       Javascript string and it is not possible to call free() on it.
      //       reset() however will clear up all allocations.
      reset();
    }
    return output;
  };

  var compileJSON: any = null;
  if ('_compileJSON' in soljson) {
    // input (text), optimize (bool) -> output (jsontext)
    compileJSON = soljson.cwrap('compileJSON', 'string', ['string', 'number']);
  }

  var compileJSONMulti: any = null;
  if ('_compileJSONMulti' in soljson) {
    // input (jsontext), optimize (bool) -> output (jsontext)
    compileJSONMulti = soljson.cwrap('compileJSONMulti', 'string', ['string', 'number']);
  }

  var compileJSONCallback: any = null;
  if ('_compileJSONCallback' in soljson) {
    // input (jsontext), optimize (bool), callback (ptr) -> output (jsontext)
    var compileInternal = soljson.cwrap('compileJSONCallback', 'string', ['string', 'number', 'number']);
    compileJSONCallback = function (input: any, optimize: any, readCallback: any) {
      return runWithCallbacks(readCallback, compileInternal, [ input, optimize ]);
    };
  }

  var compileStandard: any = null;
  if ('_compileStandard' in soljson) {
    // input (jsontext), callback (ptr) -> output (jsontext)
    var compileStandardInternal = soljson.cwrap('compileStandard', 'string', ['string', 'number']);
    compileStandard = function (input: any, readCallback: any) {
      return runWithCallbacks(readCallback, compileStandardInternal, [ input ]);
    };
  }
  if ('_solidity_compile' in soljson) {
    var solidityCompile: any;
    if (isVersion6) {
      // input (jsontext), callback (ptr), callback_context (ptr) -> output (jsontext)
      solidityCompile = soljson.cwrap('solidity_compile', 'string', ['string', 'number', 'number']);
    } else {
      // input (jsontext), callback (ptr) -> output (jsontext)
      solidityCompile = soljson.cwrap('solidity_compile', 'string', ['string', 'number']);
    }
    compileStandard = function (input: any, callbacks: any) {
      return runWithCallbacks(callbacks, solidityCompile, [ input ]);
    };
  }

  // Expects a Standard JSON I/O but supports old compilers
  var compileStandardWrapper = function (input: any, readCallback: any) {
    if (compileStandard !== null) {
      return compileStandard(input, readCallback);
    }

    function formatFatalError (message: any) {
      return JSON.stringify({
        errors: [
          {
            'type': 'JSONError',
            'component': 'solcjs',
            'severity': 'error',
            'message': message,
            'formattedMessage': 'Error: ' + message
          }
        ]
      });
    }

    try {
      input = JSON.parse(input);
    } catch (e) {
      return formatFatalError('Invalid JSON supplied: ' + e.message);
    }

    if (input['language'] !== 'Solidity') {
      return formatFatalError('Only "Solidity" is supported as a language.');
    }

    // NOTE: this is deliberately `== null`
    if (input['sources'] == null || input['sources'].length === 0) {
      return formatFatalError('No input sources specified.');
    }

    function isOptimizerEnabled (input: any) {
      return input['settings'] && input['settings']['optimizer'] && input['settings']['optimizer']['enabled'];
    }

    function translateSources (input: any) {
      var sources = {};
      for (var source in input['sources']) {
        if (input['sources'][source]['content'] !== null) {
          // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
          sources[source] = input['sources'][source]['content'];
        } else {
          // force failure
          return null;
        }
      }
      return sources;
    }

    function librariesSupplied (input: any) {
      if (input['settings']) {
        return input['settings']['libraries'];
      }
    }

    function translateOutput (output: any, libraries: any) {
      try {
        output = JSON.parse(output);
      } catch (e) {
        return formatFatalError('Compiler returned invalid JSON: ' + e.message);
      }
      output = translate.translateJsonCompilerOutput(output, libraries);
      if (output == null) {
        return formatFatalError('Failed to process output.');
      }
      return JSON.stringify(output);
    }

    var sources = translateSources(input);
    if (sources === null || Object.keys(sources).length === 0) {
      return formatFatalError('Failed to process sources.');
    }

    // Try linking if libraries were supplied
    var libraries = librariesSupplied(input);

    // Try to wrap around old versions
    if (compileJSONCallback !== null) {
      return translateOutput(compileJSONCallback(JSON.stringify({ 'sources': sources }), isOptimizerEnabled(input), readCallback), libraries);
    }

    if (compileJSONMulti !== null) {
      return translateOutput(compileJSONMulti(JSON.stringify({ 'sources': sources }), isOptimizerEnabled(input)), libraries);
    }

    // Try our luck with an ancient compiler
    if (compileJSON !== null) {
      if (Object.keys(sources).length !== 1) {
        return formatFatalError('Multiple sources provided, but compiler only supports single input.');
      }
      // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      return translateOutput(compileJSON(sources[Object.keys(sources)[0]], isOptimizerEnabled(input)), libraries);
    }

    return formatFatalError('Compiler does not support any known interface.');
  };

  return {
    version: version,
    semver: versionToSemver,
    license: license,
    lowlevel: {
      compileSingle: compileJSON,
      compileMulti: compileJSONMulti,
      compileCallback: compileJSONCallback,
      compileStandard: compileStandard
    },
    features: {
      legacySingleInput: compileJSON !== null,
      multipleInputs: compileJSONMulti !== null || compileStandard !== null,
      importCallback: compileJSONCallback !== null || compileStandard !== null,
      nativeStandardJSON: compileStandard !== null
    },
    compile: compileStandardWrapper,
    // Loads the compiler of the given version from the github repository
    // instead of from the local filesystem.
    loadRemoteVersion: function (versionString: any, cb: any) {
      var mem = new MemoryStream(null, {readable: false});
      var url = 'https://binaries.soliditylang.org/bin/soljson-' + versionString + '.js';
      https.get(url, function (response: any) {
        if (response.statusCode !== 200) {
          cb(new Error('Error retrieving binary: ' + response.statusMessage));
        } else {
          response.pipe(mem);
          response.on('end', function () {
            cb(null, setupMethods(requireFromString(mem.toString(), 'soljson-' + versionString + '.js')));
          });
        }
      }).on('error', function (error: any) {
        cb(error);
      });
    },
    // Use this if you want to add wrapper functions around the pure module.
    setupMethods: setupMethods
  };
}

module.exports = setupMethods;
