// models.js
const knex = require('knex')(require('./knexfile'));
const bookshelf = require('bookshelf')(knex);

const Todo = bookshelf.Model.extend({
  tableName: 'todos'
});

module.exports = {
  Todo,
  bookshelf
};
