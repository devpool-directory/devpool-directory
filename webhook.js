const express = require('express');
const { createHmac } = require('crypto');
const app = express();
app.use(express.json());

const config = require('./config.yml');

function verifySignature(payload, signature) {
  const hmac = createHmac('sha256', config.webhooks.secret);
  hmac.update(payload);
  const calculatedSignature = `sha256=${hmac.digest('hex')}`;
  return calculatedSignature === signature;
}

function getRewardForRole(role) {
  const reward = config.rewards.role_rewards.find(r => r.role === role);
  return reward ? reward.amount : 0;
}

function distributeReward(userId, amount) {
  // Integrate with reward distribution system
  console.log(`Distributing ${amount} tokens to user ${userId}`);
  return true;
}

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  const payload = JSON.stringify(req.body);
  
  if (!verifySignature(payload, signature)) {
    return res.status(401).send('Unauthorized');
  }

  const event = req.body;
  
  if (config.webhooks.events.includes(event.action) && event.member) {
    const role = event.member.role || 'contributor';
    const rewardAmount = getRewardForRole(role);
    
    if (rewardAmount > 0) {
      distributeReward(event.member.login, rewardAmount);
    }
  }

  res.status(200).send('Webhook processed');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
});
