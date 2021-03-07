// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'tape'.
const tape = require('tape');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'smtchecker... Remove this comment to see the full error message
const smtchecker = require('../smtchecker.js');

tape('SMTChecker', function (t: any) {
  t.test('smoke test with no axuiliaryInputRequested', function (st: any) {
    var input = {};
    var output = {};
    st.equal(smtchecker.handleSMTQueries(input, output), null);
    st.end();
  });

  t.test('smoke test with no smtlib2queries', function (st: any) {
    var input = {};
    var output = { auxiliaryInputRequested: {} };
    st.equal(smtchecker.handleSMTQueries(input, output), null);
    st.end();
  });

  t.test('smoke test with empty smtlib2queries', function (st: any) {
    var input = {};
    var output = { auxiliaryInputRequested: { smtlib2queries: { } } };
    st.equal(smtchecker.handleSMTQueries(input, output), null);
    st.end();
  });
});
