// Vercel serverless entry: every /api/* request is rewritten here (see vercel.json).
const { handleApi } = require('../server/app');

module.exports = (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const original = url.searchParams.get('__path');
  if (original !== null) {
    url.searchParams.delete('__path');
    req.url = `/api/${original}${url.search}`;
  }
  return handleApi(req, res);
};
