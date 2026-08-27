// Shim for @supabase/node-fetch in browser / React Native / Metro environment
const fetchFn = typeof fetch !== 'undefined' ? fetch : function() {
  throw new Error('fetch is not defined in this environment');
};

module.exports = fetchFn;
module.exports.default = fetchFn;
module.exports.Headers = typeof Headers !== 'undefined' ? Headers : class {};
module.exports.Request = typeof Request !== 'undefined' ? Request : class {};
module.exports.Response = typeof Response !== 'undefined' ? Response : class {};
