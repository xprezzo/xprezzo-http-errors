/*!
 * xprezzo-http-errors
 * Copyright(c) 2022 Cloudgen Wong <cloudgen.wong@gmail.com>
 * MIT Licensed
 */

'use strict'

/**
 * Module dependencies.
 * @private
 */

const deprecate = require('depd')('xprezzo-http-errors')
const setPrototypeOf = require('xprezzo-setprototypeof')
const statuses = require('statuses')
const inherits = require('util').inherits

/**
 * Trasform the given string into a JavaScript identifier
 *
 * @param {string} str
 * @returns {string}
 * @private
 */
const toIdentifier = (str) => {
  return str
    .split(/\s/)
    .map(function (token) {
      return token.slice(0, 1).toUpperCase() + token.slice(1)
    })
    .join('')
    .replace(/[^ _0-9a-z]/gi, '')
}

/**
 * Get the code class of a status code.
 * @private
 */
const codeClass = (status) => {
  return Number(String(status).charAt(0) + '00')
}

/**
 * Create HTTP error abstract base class.
 * @private
 */
const createHttpErrorConstructor= () => {
  function HttpError () {
    throw new TypeError('cannot construct abstract class')
  }
  inherits(HttpError, Error)
  return HttpError
}

/**
 * Create a new HTTP Error.
 *
 * @returns {Error}
 * @public
 */
const createError=function () {
  let err
  let msg
  let status = 500
  let props = {}
  for (let i = 0; i < arguments.length; i++) {
    let arg = arguments[i]
    if (arg instanceof Error) {
      err = arg
      status = err.status || err.statusCode || status
      continue
    }
    switch (typeof arg) {
      case 'string':
        msg = arg
        break
      case 'number':
        status = arg
        if (i !== 0) {
          deprecate('non-first-argument status code; replace with createError(' + arg + ', ...)')
        }
        break
      case 'object':
        props = arg
        break
    }
  }

  if (typeof status === 'number' && (status < 400 || status >= 600)) {
    deprecate('non-error status code; use only 4xx or 5xx status codes')
  }

  if (typeof status !== 'number' ||
    (!statuses.message[status] && (status < 400 || status >= 600))) {
    status = 500
  }

  // constructor
  let HttpError = createError[status] || createError[codeClass(status)]

  if (!err) {
    // create error
    err = HttpError
      ? new HttpError(msg)
      : new Error(msg || statuses.message[status])
    Error.captureStackTrace(err, createError)
  }

  if (!HttpError || !(err instanceof HttpError) || err.status !== status) {
    // add properties to generic error
    err.expose = status < 500
    err.status = err.statusCode = status
  }

  for (let key in props) {
    if (key !== 'status' && key !== 'statusCode') {
      err[key] = props[key]
    }
  }
  return err
}


/**
 * Set the name of a function, if possible.
 * @private
 */
const nameFunc = (func, name) => {
  let desc = Object.getOwnPropertyDescriptor(func, 'name')
  /* istanbul ignore next */
  if (desc && desc.configurable) {
    desc.value = name
    Object.defineProperty(func, 'name', desc)
  }
}

/**
 * Get a class name from a name identifier.
 * @private
 */
const toClassName = (name) => {
  return name.substr(-5) !== 'Error'
    ? name + 'Error'
    : name
}

/**
 * Create a constructor for a client error.
 * @private
 */
const createClientErrorConstructor = (HttpError, name, code) => {
  let className = toClassName(name)

  function ClientError (message) {
    // create the error object
    let msg = message != null ? message : statuses.message[code]
    let err = new Error(msg)

    // capture a stack trace to the construction point
    Error.captureStackTrace(err, ClientError)

    // adjust the [[Prototype]]
    setPrototypeOf(err, ClientError.prototype)

    // redefine the error message
    Object.defineProperty(err, 'message', {
      enumerable: true,
      configurable: true,
      value: msg,
      writable: true
    })

    // redefine the error name
    Object.defineProperty(err, 'name', {
      enumerable: false,
      configurable: true,
      value: className,
      writable: true
    })

    return err
  }

  inherits(ClientError, HttpError)
  nameFunc(ClientError, className)

  ClientError.prototype.status = code
  ClientError.prototype.statusCode = code
  ClientError.prototype.expose = true

  return ClientError
}

/**
 * Create a constructor for a server error.
 * @private
 */
const createServerErrorConstructor = (HttpError, name, code) => {
  let className = toClassName(name)

  function ServerError (message) {
    // create the error object
    let msg = message != null ? message : statuses.message[code]
    let err = new Error(msg)

    // capture a stack trace to the construction point
    Error.captureStackTrace(err, ServerError)

    // adjust the [[Prototype]]
    setPrototypeOf(err, ServerError.prototype)

    // redefine the error message
    Object.defineProperty(err, 'message', {
      enumerable: true,
      configurable: true,
      value: msg,
      writable: true
    })

    // redefine the error name
    Object.defineProperty(err, 'name', {
      enumerable: false,
      configurable: true,
      value: className,
      writable: true
    })

    return err
  }

  inherits(ServerError, HttpError)
  nameFunc(ServerError, className)

  ServerError.prototype.status = code
  ServerError.prototype.statusCode = code
  ServerError.prototype.expose = false

  return ServerError
}

/**
 * Populate the exports object with constructors for every error class.
 * @private
 */
const populateConstructorExports = (codes) => {
  codes.forEach(function forEachCode (code) {
    let CodeError
    let name = toIdentifier(statuses.message[code])

    switch (codeClass(code)) {
      case 400:
        CodeError = createClientErrorConstructor(module.exports.HttpError, name, code)
        break
      case 500:
        CodeError = createServerErrorConstructor(module.exports.HttpError, name, code)
        break
    }

    if (CodeError) {
      // export the constructor
      module.exports[code] = CodeError
      module.exports[name] = CodeError
    }
  })
}

/**
 * Module exports.
 * @public
 */
module.exports = createError
module.exports.statuses = statuses
module.exports.HttpError = createHttpErrorConstructor()
module.exports.isHttpError = ((HttpError) => {
  return function isHttpError (val) {
    if (!val || typeof val !== 'object') {
      return false
    }else if (val instanceof HttpError) {
      return true
    }
    return val instanceof Error &&
      typeof val.expose === 'boolean' &&
      typeof val.statusCode === 'number' && val.status === val.statusCode
  }
})(module.exports.HttpError)
// Populate exports for all constructors
populateConstructorExports(statuses.codes)
