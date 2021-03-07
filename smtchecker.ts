// This function checks the standard JSON output for auxiliaryInputRequested,
// where smtlib2queries represent the queries created by the SMTChecker.
// The function runs an SMT solver on each query and adjusts the input for
// another run.
// Returns null if no solving is requested.
function handleSMTQueries (inputJSON: any, outputJSON: any, solver: any) {
  var auxInputReq = outputJSON.auxiliaryInputRequested;
  if (!auxInputReq) {
    return null;
  }

  var queries = auxInputReq.smtlib2queries;
  if (!queries || Object.keys(queries).length === 0) {
    return null;
  }

  var responses = {};
  for (var query in queries) {
    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    responses[query] = solver(queries[query]);
  }

  // Note: all existing solved queries are replaced.
  // This assumes that all neccessary queries are quested above.
  inputJSON.auxiliaryInput = { smtlib2responses: responses };
  return inputJSON;
}

function smtCallback (solver: any) {
  return function (query: any) {
    try {
      var result = solver(query);
      return { contents: result };
    } catch (err) {
      return { error: err };
    }
  };
}

module.exports = {
  handleSMTQueries: handleSMTQueries,
  smtCallback: smtCallback
};
