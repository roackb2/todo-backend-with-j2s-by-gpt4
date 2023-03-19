
# j2s


# Agenda
* [Introduction](#introduction)
* [Usage](#usage)
    * [Access control](#access-control)
    * [Middlewares](#middlewares)
    * [Basic Query Examples](#basic-query-examples)
    * [Query Syntax](#query-syntax)
    * [Where Conditions Suffixes](#where-conditions-suffixes)
    * [Extra Attributes and Extra Clauses on query](#extra-attributes-and-extra-clauses-on-query)
        * [`add_attr`](#add_attr)
        * [`add_clause`](#add_clause)
    * [Relation Manipulation](#relation-manipulation)
    * [Advanced Examples](#advanced-examples)
    * [Use J2S Internal Methods](use-j2s-internal-methods)

> NOTE: since version 2.0.0, you have to use `new J2s().controller` to get the koa router instance. the J2S constructor will no longer return controller instance anymore.

# Introduction

JSON to SQL, build RESTful API server on the fly, which accepts JSON describing SQL query statements, and do CRUD accordingly, with configurable access control & pluggable middlewares.

* Tired of creating API every time that front-end requires new feature?
* Your front-end development always are lagged due to backend API not yet ready?
* API now immediately ready after you defines your model(and tables), no data query or fetching logic implementation needed!

j2s provides extreme flexibility to let front-end compose powerful query statements via JSON,
and let backend do CRUD accordingly, without adding ANY code to your backend (except for routing paths configs & corresponding ORM model definitions).

j2s relies on [Bookshelf.js](http://bookshelfjs.org/) for data modeling, and maps
url routes to models according to user configured options, and provides RESTful API
for these routes. Note that Bookshelf relies on [knex.js](http://knexjs.org/) for query building,
you'll need that dependency as well.

j2s are currently tested to work with [koa.js](http://koajs.com/) and works fine.

Supported JSON for a query will looks like:
```json
{
    "where": {
        "user.id__gt": 1,
        "user.id__lt": 10,
        "user.id__between": [1, 10],
        "user.id__not_between": [11, 13],
        "username__ne": "yo",
        "username__in": ["test1", "test2", "test4", "test6"],
        "or": {
            "username": "test",
            "user.id__in": [1, 2, 3]
        }
    },
    "join": {
        "photo": {
            "user.photo_id": "photo.id"
        }
    },
    "populate": ["photo"],
    "select": ["user.id as user_id", "user.username", "photo.url as photo_url"],
    "limit": 10,
    "offset": 1,
    "order_by": ["user.id", "desc"]
}
```

# Usage

Following shows an working example with proper environments
and how you could setup j2s routes with access control,
we assume that User has an one-to-many relation with Photo,
User has an many-to-many relation to Book, and User may have zero or one Account,
the Account model determines whether a user is administrator in its `is_admin` column.
Other model are fore examples for following sections.

```javascript
// model.js
const knex = require('knex')({
    client: 'postgresql', // or any knex supported client
    connection: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: process.env.DB_PORT || '5432',
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        charset: 'utf8'
    }
});

const bookshelf = require('bookshelf')(knex);

const User = bookshelf.Model.extend({
    tableName: 'user',
    hasTimestamps: true,

    account: function() {
        return this.hasOne(Account, 'user_id');
    }

    photo: function() {
        return this.belongsTo(Photo, 'photo_id');
    },

    comments: function() {
        return this.hasMany(Comment, 'user_id');
    }

    books: function() {
        return this.belongsToMany(Book, 'user_book', 'user_id', 'book_id')
    }
})

const Account = bookshelf.Model.extend({
    tableName: 'account',

    user: function() {
        return this.belongsTo(User, 'user_id');
    }
})

const Photo = bookshelf.Model.extend({
    tableName: 'photo',
    hasTimestamps: true,

    uploader: function() {
        return this.belongsTo(User, 'user_id');
    }
})

const Book = bookshelf.Model.extend({
    tableName: 'book',
    hasTimestamps: true,

    authors: function() {
        return this.belongsToMany(User, 'user_book', 'book_id', 'user_id')
    }
})

const Comment = bookshelf.Model.extend({
    tableName: 'comment',
    hasTimestamps: true,

    author: function() {
        return this.belongsTo(User, 'user_id');
    }
})

module.exports = {
    bookshelf: bookshelf,
    User: User,
    Photo: Photo,
    Book: Book,
    Account: Account,
    Comment: Comment
}
```

> NOTE: For access control on relation manipulation to work properly, the `Target`, `foreignKey` and `otherKey` must be set on relations.

```javascript
// routes.js
const J2S = require('j2s');
const orm = require('./model');

module.exports =  {
    '/users': orm.User, // access control obeys 'access' in J2S default configurations
    '/photos': {
        model: orm.Photo,
        access: {
            C: J2S.ALLOW,
            R: {photo_id: id} // allow reads only when user.photo_id = photo.id
            // let updates and deletion obey 'defaultAccess'
        }
    },
    '/books': {
        model: orm.Book,
        middlewares: [], // ignore any middlewares
        access: {
            // allow updates on books only when the book is written by the request user
            U: (identity, instance, ctx) => {
                // here, 'identity' represents the request User, 'instance' represents a queried Book, and `ctx` is an optional Koa request context object.
                return identity.books().fetch().then(function(books) {
                    return books.some(function(book) {
                        return book.id == instance.id
                    })
                })
            }
        }
    },
    // do not expose the Account model to users
}
```


```javascript
// app.js
const orm = require('./model');
const J2S = require('j2s')
// J2S default configurations for all routes
const options = {
    prefix: '/api',                 // optional
    log: 'debug',                   // optional
    routes: require('./routes'),    // necessary
    bookshelf: orm.bookshelf        // necessary
    access: {
        C: J2S.ALLOW,
        R: J2S.DENY,
        U: J2S.DENY,
        D: J2S.DENY
    },                              // optional
    forbids: ['join', 'cross_join'] // optional
    middlewares: [async function (ctx, next) {
        // add an authentication middleware
        // assume that request header contains user ID and a given access token,
        // check that user with that token exists in database
        let user = await orm.User.where({
            id: ctx.request.header.user_id,
            token: ctx.request.header.token
        }).fetch();
        if (!user) {
            throw new Error('authentication fail')
        }
        await next();
    }],                              // optional
    identity: function (request) {
        // should return a Promise that resolves to a Bookshelf.js model instance
        return orm.User.where({id: request.header.user_id}).fetch();
    },  // optional, don't set this to ignore access control, defaults to allow all
    admin: function(identity) {
        // should return a Promise that resolves to true or false
        return identity.account().fetch().then(function(account) {
            if (!account) {
                return false;
            }
            return account.get('is_admin');
        })
    },  // optional, the admin callback allows some user to bypass all access control rules
}
const j2s = new J2S(options)
const controller = j2s.controller

const Koa = require('koa');
const app = new Koa();

app.use(controller.routes());
app.use(controller.allowedMethods());
```

>> NOTE: log levels follows the npm log levels as following:
```
{
  error: 0,
  warn: 1,
  info: 2,
  verbose: 3,
  debug: 4,
  silly: 5
}
```
Now only the `verbose` level will print out SQL query statements
and `debug` level will print out more low level ones.

### Access control

Configurations in routes allows you to determine whether a user could do CRUD on the resource.
a route with access control looks like following:

```javascript
{
    'path': {
        model: SomeBookshelfModel,
        access: {
            C: strategy,
            R: strategy,
            U: strategy,
            D: strategy,
        }
    }
}
```

You could omit any of the C, R, U, D, keys and they would behave as how you specified in `defaultAccess` option.


The strategy could be as following:
* `J2S.ALLOW`: Allow all access to the resource.
* `J2S.DENY`: Deny all access to the resource,
* `{identity_attr: 'target_attr'}`: Allow access when the `identity_attr` equals to `target_attr`, where `identity_attr` is an attribute on the model returned by the `identity` callback (normally an column in user table), and `target_attr` is an attribute on the resource the user wants to access. Useful for one-to-one and one-to-many relations.
* A callback function: You could use a function that returns a Promise that later resolves to true or false as the strategy. This is especially useful to design access control rules that relies on many-to-many relations.

If you don't want access control at all, you could set your routes as:

```javascript
{
    'path': SomeBookshelfModel
}
```

### Middlewares

j2s allow any valid koa middleware to be run sequentially before running the CRUD, you could put any middleware you like, including authentication middlewares. You have following ways to setup middlewares.

* The `middlewares` in j2s options, e.g.
    ```javascript
    const J2S = require('j2s')
    const j2s = new J2S({
        middlewares: [function* (next) {
            // your middleware logic
        }],
        // .... other settings
    })
    ```

* The `middlewares` in routes, e.g.
    ```javascript
    '/some_route': {
        model: orm.SomeBookshelfModel,
        middlewares: [/* any number of middlewares here */],
        access: {
            C: J2S.ALLOW,
            R: J2S.ALLOW,
            U: J2S.ALLOW,
            D: J2S.ALLOW
        }
    },
    ```
    You could set `middlewares` to empty list to opt out all middlewares for a single route.

### Prompt

You are CodeGPT that writes code that could be run without error, or tell the user that you have parts that you don't know and need further information.
You strictly follow the instruction and the requirements, answer all the steps required to fulfill the requirement.
You only respond with implementation that you know that how it works and guaranteed to work. If not, you should ask for the information you need to fulfill the job.

Here's a npm package called j2s: https://www.npmjs.com/package/j2s/v/2.0.10. 
And you could read its source code here: https://github.com/roackb2/j2s/blob/master/src/index.js
Please generate all necessary steps and actual code implementation that creates a API backend for a TODO app using j2s. Do not use Swagger. Use Bookshelf.js as ORM and Knex.js as the query builder. Do not use joi as well.