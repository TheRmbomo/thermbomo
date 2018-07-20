require('./config/config');

const path = require ('path');
const express = require('express');
const bodyParser = require('body-parser');
const hbs = require('hbs');
const cookieParser = require('cookie-parser');
// const fs = require('fs');

require('./db/mongoose');

const public = path.join(__dirname + '/../public');
var app = express();

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(express.static(public));
app.use(cookieParser())
app.set('views', path.join(__dirname + '/views'));
app.set('view engine', 'hbs');
hbs.registerPartials(path.join(__dirname + '/views/partials'));

hbs.registerHelper('getCurrentYear', () => {
  return new Date().getFullYear();
});

hbs.registerHelper('eachs', function(context, sentinel, options) {
  var data = undefined,
      ret = "";
  if (options.data) {
    data = hbs.Utils.createFrame(options.data);
  }

  if (context && typeof context === 'object') {
    if (hbs.Utils.isArray(context))
      for (let i=0; i<context.length; i++) {
        if (data) data.index = i;
        if (this[sentinel]) break;
        ret = ret + options.fn(context[i], {data});
      }
    else console.log('Not an array');
  }
  return ret;
});

hbs.registerHelper('compare', function(lvalue, operator, rvalue, options) {
  var operators, result;

  if (arguments.length < 3)
    throw new Error("Handlerbars Helper 'compare' needs 2 parameters");

  if (options === undefined) {
    options = rvalue;
    rvalue = operator;
    operator = '===';
  }

  operators = {
    '==':     (l,r) => l == r,
    '===':    (l,r) => l === r,
    '!=':     (l,r) => l != r,
    '<':      (l,r) => l < r,
    '>':      (l,r) => l > r,
    '<=':     (l,r) => l <= r,
    '>=':     (l,r) => l >= r,
    'typeof': (l,r) => typeof l == r
  }

  if (!operators[operator])
    throw new Error("Handlerbars Helper 'compare' doesn't know the operator "+operator);

  result = operators[operator](lvalue,rvalue);
  if (result)
    return options.fn(this);
  else
    return options.inverse(this);
});

hbs.registerHelper('substring', function(passedString, start, end) {
  var string = passedString.substring(start,end);
  return new hbs.SafeString(string);
});

hbs.registerHelper('set', function(variable, value, options) {
  if (arguments.length < 3)
    throw new Error('Helper \'set\' needs 2 parameters');

  options.data.root[variable] = value;
});

module.exports = {app};
require('./routes/web-routes');
require('./routes/chatbot-routes');
require('./routes/user-routes');
require('./routes/search-routes');
require('./socketio');