const fs = require('fs')
const path = require('path')
const express = require('express')
const {ObjectID} = require('mongodb')
const hbs = require('hbs')
const scrypt = require('scrypt')
const valid = require('validator')
const passport = require('passport')
const uuid = require('uuid/v4')
const uuidParse = require('uuid-parse').parse

const {app} = require('./../app')
const {pgQuery} = require('./../db/pg')
const {shortenId, createUser} = require('./../middleware/passport')
const {sanitize} = require('./../middleware/utilities')
const User = require('./../db/models/user')
const {listResults, pathGroup, resourceGroup} = require('./web-routes')

var defaultAvatar = '/img/default_avatar.png'

app.get('/logout', (req, res) => {
  console.log('Logged out')
  req.logout()
  res.locals['logged-in'] = false
  res.redirect('/login')
})

app.route('/create-user')
.get((req, res) => res.redirect('back'))
.post(express.json(), express.urlencoded({extended: true}), (req, res, next) => {
  req.logout()
  var newUser = req.body, error = {}, is_error = () => Object.keys(error).length

  return new Promise((resolve, reject) => {
    if (!newUser.email) error.email = {type: 'required'}
    else if (!valid.isEmail(newUser.email + '')) error.email = {type: 'invalid'}
    // else if (!newUser.agreement) error.agreement = {type: 'required'}
    else {
      pgQuery('SELECT $1=ANY((SELECT unnest(emails) FROM users)) AS taken', [newUser.email])
      .then(q => q.rows[0])
      .then(res => {
        if (res.taken) error.email = {type: 'taken'}
      })
      .then(() => resolve())
      .catch(e => reject(e))
      return
    }
    return resolve()
  })
  .then(() => {
    if (!newUser.password) error.password = {type: 'required'}
    else if (!valid.isLength(newUser.password + '', {min: 6})) error.password = {type: 'length', min: 6}
    else if (newUser.password !== newUser.confirm_password) error.confirm_password = {type: 'not_matching'}

    try {
      newUser.display_name = sanitize('display_name', newUser.display_name)
      newUser.username = sanitize('username', newUser.display_name)

      let names = newUser.full_name.trim().split(' ').filter(i => !!i)
      newUser.first_name = sanitize('text', names[0])
      newUser.last_name = sanitize('text', names[1])
    } catch (e) {return res.status(400).send(e)}
    if (is_error()) throw error

    return scrypt.params(0.5)
  })
  .then(params => scrypt.kdf(newUser.password, params))
  .then(kdfRes => createUser({
    properties: ['emails', 'hashed_password', 'display_name', 'username', 'first_name', 'last_name'],
    values: ['ARRAY[$1]','$2','$3','$4','$5','$6'],
    params: [newUser.email, kdfRes, newUser.display_name, newUser.username,
    newUser.first_name, newUser.last_name],
    returning: 'id, username'
  }))
  .then(user => req.login(user, err => {
    if (err) return next('nf')
    console.log(user);
    res.redirect(`/user/${user.username}-${user.shortened_id.toString('hex')}`)
  }))
  .catch(e => {
    console.log(e)
    res.redirect('back')
  })
})

app.get('/login', (req, res) => res.render('login', {title: 'Sign-in'}))

app.get('/signup', (req, res) => res.render('signup', {
  title: 'Creating a User',
  email: req.query.email
}))

app.get('/users', (req, res, next) => {
  pgQuery(`SELECT display_name, username, shortened_id, avatar_path FROM users`)
  .then(q => q.rows)
  .then(users => {
    users.map(user => {
      user.shortened_id = user.shortened_id.toString('hex')
      if (!user.avatar_path) user.avatar_path = defaultAvatar
      if (!user.username) user.username = 'user'
    })
    res.render('multilist', {
      title: 'Multiple Results',
      data: {users}
    })
  })
  .catch(e => {
    console.log(Error(e))
    return next('nf')
  })
})

var userRouter = express.Router()
app.use('/user/:id', (req, res, next) => {
  var {id} = req.params
  id = id.split('-')
  id.splice(2)
  if (!id[0]) return next('nf')

  var load_user = opt => {
    opt = Object.assign({
      properties: `id, shortened_id, username, mongo_id, first_name, last_name,
      display_name, avatar_path, TO_CHAR(birthday, 'yyyy-mm-dd') AS birthday, friends, currency, created_at`,
      params: []
    }, opt)
    return pgQuery(`SELECT ${opt.properties} FROM users ${opt.condition}`, opt.params)
    .then(q => {
      if (!q.rows.length) return null
      return q.rows[0]
    })
    .then(user => {
      if (!user) return null
      user.shortened_id = user.shortened_id.toString('hex')
      return User.findById(user.mongo_id)
      .then(doc_user => Object.assign(user, doc_user.toObject()))
    })
    .catch(e => console.log(e))
  }
  new Promise((resolve, reject) => {
    if (id.length === 1) return reject()
    return resolve(load_user({
      condition: 'WHERE username=$1 AND shortened_id=$2',
      params: [id[0], new Buffer(id[1], 'hex')]
    }))
  })
  .then(user => {
    if (!user) return next('nf')

    Object.assign(user, {
      name: user.first_name + ((user.first_name && user.last_name) ? ' ' + user.last_name : user.last_name),
      url: `/user/${id[0]}-${user.shortened_id}`,
      created_at: req.format_date(user.created_at),
      avatar_path: user.avatar_path || defaultAvatar,
      own: req.user && req.user.id === user.id
    })

    res.locals.user = user
    next()
  })
  .catch(e => next('nf'))
}, userRouter)

userRouter.get('/', (req, res, next) => {
  var user = res.locals.user

  res.render('user', {
    title: (user.display_name) ? user.display_name : 'User Profile'
  })
})

userRouter.get('/edit', (req, res, next) => {
  if (!req.user) return res.redirect('/login')
  var user = res.locals.user
  if (user.id !== req.user.id) return res.redirect(`/user/${user.url}`)

  user.is_public ? (user.is_public = 'checked') : (user.is_private = 'checked', user.is_public = '')

  res.render('settings', {
    type: 'user',
    page: 'user_edit',
    title: 'Editing Profile'
  })
})

userRouter.get('/paths', (req, res, next) => {
  var user = res.locals.user
  if (!user) return next('nf')

  // TODO: If user has made this page private, return next()

  var perspective = (req.user && req.user.id === user.id) ? 'You' : 'They',
  own = req.user.id === user.id

  Promise.all([
    pathGroup(req, listResults, {
      group_name: (req.user && req.user.id === user.id) ?
      'Your Paths' : `${user.display_name}'s Paths`,
      condition: 'WHERE created_by=$1',
      params: [user.id],
      empty_message: `${perspective} haven\'t created any paths yet.`,
      visible: own || user.show_createdPaths
    }).catch(e => e),
    pathGroup(req, listResults, {
      group_name: 'Managed Paths',
      condition: 'WHERE id = ANY((SELECT path_keys FROM users WHERE id=$1)::uuid[])',
      params: [user.id],
      empty_message: `${perspective} aren\'t managing anyone\'s paths yet.`,
      visible: own || user.show_managedPaths
    }).catch(e => e),
    pathGroup(req, listResults, {
      group_name: 'Currently Following',
      condition: 'WHERE id = ANY((SELECT paths_following FROM users WHERE id=$1)::uuid[])',
      params: [user.id],
      empty_message: `${perspective} aren\'t following anyone\'s paths yet.`,
      visible: own || user.show_followedPaths
    }).catch(e => e)
  ])
  .then(listings => {
    listings = listings.filter(i => !!i).reduce((text, group) => {
      return new hbs.SafeString(text + hbs.compile('{{> results_group}}')(group))
    }, '')
    return res.render('list_results', {
      title: 'Your Paths of Learning',
      back: {url: user.url},
      type: 'path',
      create: 'Create a Path of Learning',
      listings,
      js: 'list_paths'
    })
  })
  .catch(e => {
    console.log(Error(e))
    return next('nf')
  })
})

/*
app.get('/my-files', (req, res, next) => {
  if (!req.user) return res.redirect('/login')

  var full = false, files
  pgQuery(`SELECT id AS image_id, name, path, size, type, created_at,
  times_accessed, last_accessed FROM files WHERE owner=$1;`, [req.user.id])
  .then(q => q.rows)
  .then(files => {
    var taken_space = files.reduce((acc,cur) => acc + cur.size, 0)
    if (taken_space >= 1024 * 1024 * 5) full = true

    files.map(file => Object.keys(file).map(key => {
      switch (key) {
        case 'size':
        file[key] = Math.floor(file[key]/(1024*1024) * 100) / 100
        file[key] += ' MB'
        break
        case 'created_at':
        case 'last_accessed':
        file[key] = req.format_date(file[key])
        break
        case 'type':
        if (file[key].substr(0,5) !== 'image') {
          file['path'] = '/img/default_file.png'
        }
      }
    }))

    taken_space = Math.floor(taken_space/(1024 * 1024) * 1000) / 1000

    res.render('my_files.hbs', {
      title: 'My Files',
      taken_space,
      remaining_space: Math.floor((5 - taken_space) * 1000) / 1000,
      files
    })
  })
  .catch(e => {
    console.log(Error(e))
    return next('nf')
  })
})

app.post('/upload-file', (req, res, next) => {
  if (!req.user) return res.redirect('/login')

  pgQuery(`SELECT id AS image_id, name, path, size, type, created_at,
  times_accessed, last_accessed FROM files WHERE owner=$1;`, [req.user.id])
  .then(q => q.rows)
  .then(rows => {
    var taken_space = rows.reduce((acc,cur) => acc + cur.size, 0)
    if (taken_space >= 1024 * 1024 * 5) return null

    return require('./../middleware/formidable')(req,res)
  })
  .then(upload => {
    if (!upload || upload.error) throw `Upload Error: ${(upload && upload.error) ? upload.error : 'Cancelled'}`

    if (upload.files[0].size + taken_space >= 1024 * 1024 * 5) {
      return fs.unlink(path.join(app.locals.absoluteDir, 'public/', 'files/', upload.filename), err => err)
    }
    var file = upload.files[0], filePath = '/'

    if (file.type.substr(0,5) === 'image') {
      fs.rename(path.join(app.locals.public, 'files/', upload.filename), path.join(app.locals.public, 'img/', upload.filename), err => err)
      filePath += 'img/'
    }

    pgQuery(`INSERT INTO files (name, owner, path, size, type)
    values ($1, $2, $3, $4, $5);`, [file.name,req.user.id,`${filePath}${upload.filename}`,file.size,file.type])
    return
  })
  .then(() => res.redirect('back'))
  .catch(e => {
    console.log(Error(e))
    return next('nf')
  })
})

app.post('/delete-file', express.json(), express.urlencoded({extended: true}), (req, res, next) => {
  if (!req.user) return res.redirect('/login')
  var {image_id, file_name} = req.body

  if (req.body['change-avatar']) {
    return pgQuery('UPDATE users SET avatar_path=$2 WHERE id=$1', [req.user.id, file_name])
    .then(q => res.redirect('back'))
    .catch(e => console.log(Error(e)))
  }

  if (req.user.avatar_path === file_name) {
    pgQuery('UPDATE users SET avatar_path=NULL WHERE id=$1', [req.user.id])
    .catch(e => console.log(Error(e)))
  }

  pgQuery('SELECT owner, path FROM files WHERE id=$1', [image_id])
  .then(q => q.rows[0])
  .then(file => {
    if (req.user.id !== file.owner) throw ''
    return new Promise((resolve, reject) => fs.unlink(path.join(app.locals.absoluteDir,
    '/public', file.path), err => err ? reject(err) : resolve()))
  })
  .then(() => pgQuery('DELETE FROM files WHERE id=$1', [image_id]))
  .then(() => res.redirect('back'))
  .catch(e => {
    console.log(Error(e))
    next('nf')
  })
})
*/
