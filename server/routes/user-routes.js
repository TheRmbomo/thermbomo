const express = require('express');
const bodyParser = require('body-parser');
const {ObjectID} = require('mongodb');
const _ = require('lodash');
const xss = require('xss');

const {app} = require('./../server');
const {User} = require('./../models/user');
const {authenticate, loggedin} = require('./../middleware/authenticate');
const {renderPage} = require('./web-routes');

// Calling profile page
var userProfile = (res, user, {private = false, edit = false} = {}) => {
  var {name, bio, email} = user;
  renderPage(res, 'userProfile.hbs', {
    private, edit,
    hasName: (!!name),
    name: (name || email),
    bio
  });
};

// For calling one's own private profile page
var userPrivateProfile = (req, res, edit) => {
  if (req.loggedIn) userProfile(res, req.user, {private: true, edit})
  else res.redirect('/login');
};

app.get('/user/:id', loggedin, (req, res) => {
  var {id} = req.params;
  // Currently redirecting to home, plan on redirect to /users search form
    // with the message of 'User is not found'.
  if (!ObjectID.isValid(id)) return res.redirect('/');
  User.findById(id)
    .then(foundUser => {
      // Plan on redirect to /users with message 'User is not found'
      if (!foundUser) return res.redirect('/');
      var user = foundUser;
      userProfile(res, user);
    })
    .catch(e => {
      console.log(e);
      // Give them error message.
      res.redirect('/');
    });
});

app.post('/signup', (req, res) => {
  var user = new User(_.pick(req.body, ['email', 'password']));

  user.save()
    .then(() => user.generateAuthToken(res))
    .catch(e => res.status(400).send(e));
});

app.post('/login', (req, res) => {
  var {email, password} = _.pick(req.body, ['email', 'password']);

  User.findByCredentials(email, password)
    .then(user => user.generateAuthToken(res))
    .catch(e => res.status(401).send(e));
});

app.get('/users/me', (req, res) => {
  userPrivateProfile(req, res, false);
});

app.get('/users/edit', loggedin, (req, res) => {
  userPrivateProfile(req, res, true);
});

app.post('/users/me', authenticate, (req, res) => {
  var subProfile = _.pick(req.body, ['name', 'bio']);
  subProfile.bio = xss(subProfile.bio);
  console.log(subProfile.bio);
  Object.assign(req.user, subProfile);
  return req.user.save()
    .then(() => res.redirect(303, '/users/me'))
    .catch(e => res.redirect(303, '/users/me'));
});

app.delete('/logout', authenticate, (req, res) => {
  req.user.removeToken(req.token)
    .then(() => res.status(200).send({message: 'Successfully logged out'}))
    .catch(e => res.status(400).send(e));
});
