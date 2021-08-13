/**
 * Copyright 2018, Google LLC
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const {google} = require('googleapis');
const querystring = require('querystring');
const pify = require('pify');
const config = require('./config');
const oauth = require('./lib/oauth');
const helpers = require('./lib/helpers');
const onlythelatest = require('./lib/onlythelatest');

const gmail = google.gmail({version: 'v1', auth: oauth.client});

/**
 * Request an OAuth 2.0 authorization code
 * Only new users (or those who want to refresh
 * their auth data) need visit this page
 */
exports.oauth2init = (req, res) => {
  // Define OAuth2 scopes
  const scopes = [
    'https://www.googleapis.com/auth/gmail.labels',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
  ];

  // Generate + redirect to OAuth2 consent form URL
  const authUrl = oauth.client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent' // Required in order to receive a refresh token every time
  });
  return res.redirect(authUrl);
};

/**
 * Get an access token from the authorization code and store token in Datastore
 */
exports.oauth2callback = (req, res) => {
  // Get authorization code from request
  const code = req.query.code;

  // OAuth2: Exchange authorization code for access token
  return new Promise((resolve, reject) => {
    oauth.client.getToken(code, (err, token) =>
      (err ? reject(err) : resolve(token))
    );
  })
    .then((token) => {
      // Get user email (to use as a Datastore key)
      oauth.client.credentials = token;
      return Promise.all([token, oauth.getEmailAddress()]);
    })
    .then(([token, emailAddress]) => {
      // Store token in Datastore
      return Promise.all([
        emailAddress,
        oauth.saveToken(emailAddress)
      ]);
    })
    .then(([emailAddress]) => {
      // Respond to request
      res.redirect(`/initWatch?emailAddress=${querystring.escape(emailAddress)}`);
    })
    .catch((err) => {
      // Handle error
      console.error(err);
      res.status(500).send('Something went wrong; check the logs.');
    });
};

/**
 * Initialize a watch on the user's inbox
 */
exports.initWatch = (req, res) => {
  // Require a valid email address
  if (!req.query.emailAddress) {
    return res.status(400).send('No emailAddress specified.');
  }
  const email = querystring.unescape(req.query.emailAddress);
  if (!email.includes('@')) {
    return res.status(400).send('Invalid emailAddress.');
  }

  // Retrieve the stored OAuth 2.0 access token
  return oauth.fetchToken(email)
    .then(onlythelatest.createLabel)
    .then(onlythelatest.stopAllWatches)
    .then(onlythelatest.setInboxWatch)
    // .then(onlythelatest.setLabelWatch)
    .then(() => {
      // Respond with status
      res.write('Watch initialized!');
      res.status(200).send();
    })
    .catch((err) => {
      // Handle errors
      if (err.message === config.UNKNOWN_USER_MESSAGE) {
        res.redirect('/oauth2init');
      } else {
        console.error(err);
        res.status(500).send(err);
      }
    });
};

const handleErrors = (err) => {
  if (err.message == config.NO_ACTION) {
    return;
  }

  // Handle unexpected errors
  if (!err.message || err.message !== config.NO_LABEL_MATCH) {
    console.error(err);
  }
};

/**
* Process new messages as they are received
*/
exports.onNewMessage = (event) => {
  // Parse the Pub/Sub message
  const dataStr = Buffer.from(event.data, 'base64').toString('ascii');
  const dataObj = JSON.parse(dataStr);

  return oauth.fetchToken(dataObj.emailAddress)
    .then(helpers.listMessageIds)
    .then(messages => helpers.getMessageById(messages[0].id))
    .then(onlythelatest.checkForLabel)
    .then(onlythelatest.processNewMessageFromLabeledSender)
    .catch(handleErrors);
};
