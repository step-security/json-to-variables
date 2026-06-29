const fs = require('fs');
const path = require('path');
const core = require('@actions/core');
const axios = require('axios');

async function validateSubscription() {
  let repoPrivate;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath && fs.existsSync(eventPath)) {
    const payload = JSON.parse(fs.readFileSync(eventPath, "utf8"));
    repoPrivate = payload?.repository?.private;
  }

  const upstream = 'antifree/json-to-variables';
  const action = process.env.GITHUB_ACTION_REPOSITORY;
  const docsUrl = 'https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions';
  core.info('');
  core.info('\u001b[1;36mStepSecurity Maintained Action\u001b[0m');
  core.info(`Secure drop-in replacement for ${upstream}`);
  if (repoPrivate === false) core.info('\u001b[32m\u2713 Free for public repositories\u001b[0m');
  core.info(`\u001b[36mLearn more:\u001b[0m ${docsUrl}`);
  core.info('');
  if (repoPrivate === false) return;
  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const body = { action: action || '' };
  if (serverUrl !== 'https://github.com') body.ghes_server = serverUrl;
  try {
    await axios.post(
      `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
      body, { timeout: 3000 }
    );
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 403) {
      core.error(`\u001b[1;31mThis action requires a StepSecurity subscription for private repositories.\u001b[0m`);
      core.error(`\u001b[31mLearn how to enable a subscription: ${docsUrl}\u001b[0m`);
      process.exit(1);
    }
    core.info('Timeout or API not reachable. Continuing to next step.');
  }
}

async function run() {
  await validateSubscription();

  try {
    const fileName = core.getInput('filename', { required: true });
    const prefix = core.getInput('prefix', { required: false }) || '';
    const hasSecrets = core.getBooleanInput('has_secrets', { required: false });

    const fullPath = path.resolve(fileName);

    core.info(`Processing file: ${fullPath}. Contains secrets: ${hasSecrets}`);

    const rawdata = fs.readFileSync(fullPath);
    const rootObj = JSON.parse(rawdata);

    const processVariable = (variable, name) => {

      if (typeof variable === 'undefined' || variable === null) {
        return;
      }

      if (Array.isArray(variable)) {
        variable.forEach((value, index) => {
          processVariable(value, `${name}_${index}`);
        });
      }
      else if (typeof variable === 'object') {
        for (const key in variable) {
          const variableName = name.length === 0
            ? key
            : `${name}_${key}`;

          processVariable(variable[key], variableName);
        }
      }
      else {
        if (hasSecrets) {
          core.info(`SET ENV '${name}' = ***`);
          core.setSecret(variable.toString())
        }
        else {
          core.info(`SET ENV '${name}' = ${variable}`);
        }

        core.exportVariable(name, variable.toString());
      }
    };

    processVariable(rootObj, prefix);

  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
