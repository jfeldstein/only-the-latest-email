'use strict';

const oauth = require('./oauth');
const {google} = require('googleapis');
const gmail = google.gmail({ version: 'v1', auth: oauth.client });
const config = require('../config');

exports.createLabel = (name=config.ONLY_LATEST_LABEL_NAME) =>
  gmail.users.labels.create({
    userId: 'me',
    requestBody: {
      "labelListVisibility": "labelHide",
      "messageListVisibility": "show",
      name
    }
  })
  .catch(err => {
    if(err.code == 409) {
      // Already exists, continue
      return;
    }

    // Any other error
    throw err;
  })

let labelId;
const getLabelId = name => new Promise((resolve, reject) => {
  if(labelId) {
    return resolve(labelId);
  }

  gmail.users.labels.list({ userId: 'me' })
    .then(res => {
      const labels = res.data.labels;
      const label = labels.find(l => l.name == name);
      labelId = label.id; // Throws exception if label is not found
      resolve(label.id);
    })
});
  
const setWatch = (labelIds) =>
  gmail.users.watch({
    userId: 'me',
    requestBody: {
      labelIds,
      topicName: config.TOPIC_NAME
    }
  });

exports.setInboxWatch = () =>
  setWatch(['INBOX']);

// exports.setLabelWatch = () =>
//   setWatch([config.ONLY_LATEST_LABEL_NAME]);

exports.stopAllWatches = () =>
  gmail.users.stop({
    userId: 'me',
  });

const extractEmail = (from) => {
  const emails = from.match(/[^@<\s]+@[^@\s>]+/g);
  return emails && emails[0];
};

const getAllHeaders = (msg) => msg.payload.headers;

const getHeaderValue = (msg, header) => {
  const found = getAllHeaders(msg).find(h => h.name == header);
  return found ? found.value : undefined;
}
  
const getSender = msg => extractEmail(getHeaderValue(msg, 'From'));

const isLabeledSender = (sender) =>
  !sender ? false : 
    getLabeledMessagesFromSender(sender)
      .then(msgs => msgs.length > 0);

const getMessages = (sender, lId) =>
  gmail.users.messages.list({
    userId: 'me',
    q: `from:${sender}`,
    labelIds: [lId],
    maxResults: 500,
  })
  .then(res => res.data.messages);

const getLabeledMessagesFromSender = (sender=null) =>
  getLabelId(config.ONLY_LATEST_LABEL_NAME)
    .then(labelId => getMessages(sender, labelId));

const getInboxMessagesFromSender = (sender=null) =>
  getMessages(sender, 'INBOX');


const addLabelMessages = (ids) => {
  if(ids.length == 0) {
    return Promise.resolve();
  }

  return getLabelId(config.ONLY_LATEST_LABEL_NAME)
    .then(labelId =>
      gmail.users.messages.batchModify({
      ids,
      userId: 'me',
      addLabelIds: [labelId],
    }));
};

const addLabelToMessage = id => addLabelMessages([id]);

const messageIdsWithout = (msgs, withoutMsg) =>
  msgs
    .map(msg => msg.id)
    .filter(id => id != withoutMsg.id);

const sweepMessages = ids => {
  if(ids.length == 0) {
    return Promise.resolve();
  }

  return getLabelId(config.ONLY_LATEST_LABEL_NAME)
    .then(labelId => 
      gmail.users.messages.batchModify({
        ids,
        userId: 'me',
        removeLabelIds: [
          'INBOX', 
          labelId
        ],
      }));
}

exports.processNewMessageFromLabeledSender = msg => 
  addLabelToMessage(msg.id)
    .then(() => 
      Promise.all([
        getInboxMessagesFromSender(getSender(msg)),
        getLabeledMessagesFromSender(getSender(msg))
      ])
    )
    .then(([inboxMsgs, labelledMsgs]) => messageIdsWithout([...inboxMsgs, ...labelledMsgs], msg))
    .then(sweepMessages)

exports.checkForLabel = msg => 
  isLabeledSender(getSender(msg))
  .then(isLabeled => {
    if(!isLabeled) {
      console.log('Sender is not labeled. Nothing to do.');
      throw new Error(config.NO_ACTION);
    }
    return msg;
  })
  