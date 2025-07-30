/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
/* eslint-env node */

import {NoteStore as EDAMNoteStore} from './thrift/gen-js2/NoteStore';
import {UserStore as EDAMUserStore} from './thrift/gen-js2/UserStore';
import BinaryHttpTransport from './thrift/transport/binaryHttpTransport';
import BinaryProtocol from './thrift/protocol/binaryProtocol';
import pjson from '../package.json';

const AUTH_PLACEHOLDER = 'AUTH_TOKEN';

function argsToParamNames(args) {
  const fields = args.fields;
  const keys = Object.keys(fields);
  const paramNames = new Array(keys.length);
  let fid;
  let index;

  for (let i = 0; i < keys.length; i++) {
    fid = keys[i];
    index = fields[fid].index;
    if (index !== null) {
      paramNames[index] = fields[fid].alias;
    } else {
      paramNames[i] = fields[fid].alias;
    }
  }

  return paramNames;
}

/**
 * Takes in a Store Client function, and supplies it with an authentication token when
 * necessary. Will return a Promise instead of using callbacks.
 *
 * @param {Function} fn
 * @param {String} fnName
 * @return {Promise}
 */
function makeProxyPromise(fn, fnName, info) {
  return function() {
    let newArgs = [];
    let paramNames = argsToParamNames(info.args);
    let requiresAuthToken = false;
    for (let i = 0; i < paramNames.length; i++) {
      let param = paramNames[i];
      if (param === 'authenticationToken') {
        newArgs.push(AUTH_PLACEHOLDER);
        requiresAuthToken = true;
      }
      if (i < arguments.length) {
        newArgs.push(arguments[i]);
      }
    }
    return new Promise((resolve, reject) => {
      const expectedNum = requiresAuthToken ? paramNames.length - 1 : paramNames.length;
      const actualNum = requiresAuthToken ? newArgs.length - 1 : newArgs.length;
      if (expectedNum !== actualNum) {
        reject(new Error(`Incorrect number of arguments passed to ${fnName}: expected ${expectedNum} but found ${actualNum}`));
      } else {
        const prelimPromise = requiresAuthToken ? this.getAuthToken() : Promise.resolve();
        prelimPromise.then(authTokenMaybe => {
          if (authTokenMaybe) {
            newArgs[newArgs.indexOf(AUTH_PLACEHOLDER)] = authTokenMaybe;
          }
          newArgs.push((err, response) => err ? reject(err) : resolve(response));
          fn.apply(this, newArgs);
        }).catch(err => reject(err));
      }
    });
  };
}

function extendClientWithEdamClient(Client, EDAMClient, Store) {
  for (let key in EDAMClient.prototype) {
    if (typeof EDAMClient.prototype[key] === 'function') {
      Client.prototype[key] = makeProxyPromise(EDAMClient.prototype[key], key, Store[key]);
    }
  }
}

function getAdditionalHeaders(token) {
  const m = token && token.match(/:A=([^:]+):/);
  const userAgentId = m ? m[1] : '';
  return {
    'User-Agent': `${userAgentId}/${pjson.version}; Node.js / ${process.version}`,
  };
}

class UserStoreClient extends EDAMUserStore.Client {
  constructor(opts = {}) {
    if (opts.url) {
      const transport = new BinaryHttpTransport(opts.url);
      const protocol = new BinaryProtocol(transport);
      transport.addHeaders(getAdditionalHeaders(opts.token));
      super(protocol);
      this.url = opts.url;
    } else {
      throw Error('UserStoreClient requires a UserStore Url when initialized');
    }
    if (opts.token) {
      this.token = opts.token;
    }
  }

  getAuthToken() {
    return new Promise(resolve => resolve(this.token));
  }
}
extendClientWithEdamClient(UserStoreClient, EDAMUserStore.Client, EDAMUserStore);

class NoteStoreClient extends EDAMNoteStore.Client {
  constructor(opts = {}) {
    if (opts.url) {
      const transport = new BinaryHttpTransport(opts.url);
      const protocol = new BinaryProtocol(transport);
      transport.addHeaders(getAdditionalHeaders(opts.token));
      super(protocol);
      this.url = opts.url;
    } else {
      throw Error('NoteStoreClient requires a NoteStore Url when initialized');
    }
    if (opts.token) {
      this.token = opts.token;
    }
  }

  getAuthToken() {
    return new Promise(resolve => resolve(this.token));
  }
}

extendClientWithEdamClient(NoteStoreClient, EDAMNoteStore.Client, EDAMNoteStore);

export {NoteStoreClient, UserStoreClient};
