// @ts-expect-error ts-migrate(2300) FIXME: Duplicate identifier 'assert'.
var assert = require('assert');
var keccak256 = require('js-sha3').keccak256;

function libraryHashPlaceholder (input: any) {
  return '$' + keccak256(input).slice(0, 34) + '$';
}

var linkBytecode = function (bytecode: any, libraries: any) {
  assert(typeof bytecode === 'string');
  assert(typeof libraries === 'object');
  // NOTE: for backwards compatibility support old compiler which didn't use file names
  var librariesComplete = {};
  for (var libraryName in libraries) {
    if (typeof libraries[libraryName] === 'object') {
      // API compatible with the standard JSON i/o
      for (var lib in libraries[libraryName]) {
        // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        librariesComplete[lib] = libraries[libraryName][lib];
        // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        librariesComplete[libraryName + ':' + lib] = libraries[libraryName][lib];
      }
    } else {
      // backwards compatible API for early solc-js versions
      var parsed = libraryName.match(/^([^:]+):(.+)$/);
      if (parsed) {
        // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        librariesComplete[parsed[2]] = libraries[libraryName];
      }
      // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      librariesComplete[libraryName] = libraries[libraryName];
    }
  }

  for (libraryName in librariesComplete) {
    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    var hexAddress = librariesComplete[libraryName];
    if (hexAddress.slice(0, 2) !== '0x' || hexAddress.length > 42) {
      throw new Error('Invalid address specified for ' + libraryName);
    }
    // remove 0x prefix
    hexAddress = hexAddress.slice(2);
    hexAddress = Array(40 - hexAddress.length + 1).join('0') + hexAddress;

    // Support old (library name) and new (hash of library name)
    // placeholders.
    var replace = function (name: any) {
      // truncate to 37 characters
      var truncatedName = name.slice(0, 36);
      var libLabel = '__' + truncatedName + Array(37 - truncatedName.length).join('_') + '__';
      while (bytecode.indexOf(libLabel) >= 0) {
        bytecode = bytecode.replace(libLabel, hexAddress);
      }
    };

    replace(libraryName);
    replace(libraryHashPlaceholder(libraryName));
  }

  return bytecode;
};

var findLinkReferences = function (bytecode: any) {
  assert(typeof bytecode === 'string');
  // find 40 bytes in the pattern of __...<36 digits>...__
  // e.g. __Lib.sol:L_____________________________
  var linkReferences = {};
  var offset = 0;
  while (true) {
    var found = bytecode.match(/__(.{36})__/);
    if (!found) {
      break;
    }

    var start = found.index;
    // trim trailing underscores
    // NOTE: this has no way of knowing if the trailing underscore was part of the name
    var libraryName = found[1].replace(/_+$/gm, '');

    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    if (!linkReferences[libraryName]) {
      // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      linkReferences[libraryName] = [];
    }

    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    linkReferences[libraryName].push({
      // offsets are in bytes in binary representation (and not hex)
      start: (offset + start) / 2,
      length: 20
    });

    offset += start + 20;

    bytecode = bytecode.slice(start + 20);
  }
  return linkReferences;
};

module.exports = {
  linkBytecode: linkBytecode,
  findLinkReferences: findLinkReferences
};
