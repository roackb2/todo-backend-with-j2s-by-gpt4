// migrations/TIMESTAMP_create_todo_table.js
exports.up = function(knex) {
  return knex.schema.createTable('todos', function(table) {
    table.increments('id').primary();
    table.string('title').notNullable();
    table.text('description');
    table.boolean('completed').defaultTo(false);
    table.timestamps();
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('todos');
};
