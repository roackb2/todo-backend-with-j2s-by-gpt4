// app.js
const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const J2S = require('j2s');
const { bookshelf } = require('./models');
const routes = require('./routes');

const app = new Koa();
app.use(bodyParser());

const j2s = new J2S({
  prefix: '/api',
  log: 'debug',
  routes,
  bookshelf: bookshelf,
  access: {
    C: J2S.ALLOW,
    R: J2S.ALLOW,
    U: J2S.ALLOW,
    D: J2S.ALLOW
  }
});

const controller = j2s.controller;
app.use(controller.routes());
app.use(controller.allowedMethods());

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
