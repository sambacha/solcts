#!/usr/bin/env node

// This is used to download the correct binary version
// as part of the prepublish step.

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'pkg'.
var pkg = require('./package.json');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'fs'.
var fs = require('fs');
var https = require('follow-redirects').https;
var MemoryStream = require('memorystream');
var keccak256 = require('js-sha3').keccak256;

function getVersionList (cb: any) {
  console.log('Retrieving available version list...');

  var mem = new MemoryStream(null, { readable: false });
  https.get('https://solc-bin.ethereum.org/bin/list.json', function (response: any) {
    if (response.statusCode !== 200) {
      console.log('Error downloading file: ' + response.statusCode);
      process.exit(1);
    }
    response.pipe(mem);
    response.on('end', function () {
      cb(mem.toString());
    });
  });
}

function downloadBinary (outputName: any, version: any, expectedHash: any) {
  console.log('Downloading version', version);

  // Remove if existing
  if (fs.existsSync(outputName)) {
    fs.unlinkSync(outputName);
  }

  process.on('SIGINT', function () {
    console.log('Interrupted, removing file.');
    fs.unlinkSync(outputName);
    process.exit(1);
  });

  var file = fs.createWriteStream(outputName, { encoding: 'binary' });
  https.get('https://solc-bin.ethereum.org/bin/' + version, function (response: any) {
    if (response.statusCode !== 200) {
      console.log('Error downloading file: ' + response.statusCode);
      process.exit(1);
    }
    response.pipe(file);
    file.on('finish', function () {
      file.close(function () {
        var hash = '0x' + keccak256(fs.readFileSync(outputName, { encoding: 'binary' }));
        if (expectedHash !== hash) {
          console.log('Hash mismatch: ' + expectedHash + ' vs ' + hash);
          process.exit(1);
        }
        console.log('Done.');
      });
    });
  });
}

console.log('Downloading correct solidity binary...');

getVersionList(function (list: any) {
  list = JSON.parse(list);
  var wanted = pkg.version.match(/^(\d+\.\d+\.\d+)$/)[1];
  var releaseFileName = list.releases[wanted];
  var expectedFile = list.builds.filter(function (entry: any) { return entry.path === releaseFileName; })[0];
  if (!expectedFile) {
    console.log('Version list is invalid or corrupted?');
    process.exit(1);
  }
  var expectedHash = expectedFile.keccak256;
  downloadBinary('soljson.js', releaseFileName, expectedHash);
});
