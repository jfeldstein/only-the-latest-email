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

const cheerio = require('cheerio');
const {google} = require('googleapis');
const oauth = require('./oauth');
const pify = require('pify');

const gmail = google.gmail({ version: 'v1', auth: oauth.client });

/**
 * Get base64-encoded image attachments in a GMail message
 * @param message The GMail message to extract images from
 * @returns A promise containing a list of base64-encoded images
 */
const _getImageAttachments = (message) => {
  // Get attachment data
  const attachmentIds = message.payload.parts
    .filter(x => x.mimeType && x.mimeType.includes('image'))
    .map(x => x.body.attachmentId);

  // Return base64-encoded images
  return Promise.all(attachmentIds.map(attachmentId => {
    return pify(gmail.users.messages.attachments.get)({
      auth: oauth.client,
      userId: 'me',
      id: attachmentId,
      messageId: message.id
    }).then(result => {
      // Convert from base64url to base64
      const imageData = result.data.replace(/-/g, '+').replace(/_/g, '/');
      return Buffer.from(imageData, 'base64');
    });
  }));
};

/**
 * Get URL-referenced images in a GMail message
 * @param message The GMail message to extract images from
 * @returns A list of image URLs
 */
const _getImageUrls = (message) => {
  const unpack = (x) => {
    return Buffer.from(x.body.data || '', 'base64').toString();
  };

  // Get message's HTML
  let rawHtml = message.payload.parts.map(
    p => unpack(p)
  ).join('');
  rawHtml += unpack(message.payload);

  // Return image URLs
  return cheerio.load(rawHtml)('img')
    .toArray()
    .map(image => image.attribs.src);
};

/**
 * Get all images from a GMail message
 * @param message The GMail message to extract images from
 * @returns A promise containing a list of {image URLs, base64-encoded images}
 */
exports.getAllImages = (msg) => {
  console.log('getAllImages', JSON.stringify(msg));
  const urlImages = _getImageUrls(msg);
  const base64Images = _getImageAttachments(msg);
  return Promise.all([urlImages, base64Images])
    .then(([urlImages, base64Images]) => urlImages.concat(base64Images));
};

/**
 * List GMail message IDs
 * @returns A promise containing a list of GMail message IDs
 */
exports.listMessageIds = () =>
  gmail.users.messages.list({
    userId: 'me',
    maxResults: 1,
    labelIds: ['INBOX']
  })
  .then(res => res.data.messages);

/**
 * Get a GMail message given a message ID
 * @param messageId The ID of the message to get
 * @returns A promise containing the specified GMail message
 */
exports.getMessageById = (id) =>
  gmail.users.messages.get({
    id,
    userId: 'me'
  })
  .then(res => res.data);

/**
 * Label a GMail message
 * @param messageId The ID of the message to label
 * @param labels The labels to apply to the message
 */
exports.labelMessage = (messageId, labels) => 
  gmail.users.messages.modify({
    id: messageId,
    userId: 'me',
    resource: {
      addLabelIds: labels
    }
  });

