'use strict';

const {
  EventBridgeClient,
  EnableRuleCommand,
  DisableRuleCommand
} = require('@aws-sdk/client-eventbridge');

const events = new EventBridgeClient({});

async function setScheduleEnabled(ruleName, enabled) {
  const input = { Name: ruleName };
  if (enabled) {
    await events.send(new EnableRuleCommand(input));
  } else {
    await events.send(new DisableRuleCommand(input));
  }
}

module.exports = { setScheduleEnabled };
